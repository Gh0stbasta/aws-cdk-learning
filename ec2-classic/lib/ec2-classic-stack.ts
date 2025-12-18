import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export class Ec2ClassicStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. DAS NETZWERK (VPC)
    // CDK erstellt standardmäßig ein "teures" VPC mit NAT Gateways.
    // Wir zwingen es hier zu einer günstigen "Public Only" Konfiguration für das Lab.
    const vpc = new ec2.Vpc(this, 'MyLabVPC', {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'PublicSubnet',
          subnetType: ec2.SubnetType.PUBLIC,
        }
      ],
      // WICHTIG: Spart Kosten (sonst ca. 30$/Monat pro NAT Gateway!)
      natGateways: 0 
    });

    // 2. SICHERHEIT (Security Groups)
    
    // SG für Frontend: Darf HTTP (80) von überall empfangen
    const frontendSG = new ec2.SecurityGroup(this, 'FrontendSG', { 
      vpc, 
      description: 'Allow HTTP access from world' 
    });
    frontendSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP from anywhere');

    // SG für Backend: Darf Port 3000 NUR vom Frontend empfangen
    const backendSG = new ec2.SecurityGroup(this, 'BackendSG', { 
      vpc, 
      description: 'Allow access only from Frontend' 
    });
    
    // DAS IST CDK MAGIE:
    // Wir referenzieren das OBJEKT 'frontendSG', keine IP-Adressen!
    // AWS löst das im Hintergrund auf ("Allow traffic from Group ID sg-12345").
    backendSG.addIngressRule(frontendSG, ec2.Port.tcp(3000), 'Allow Node traffic from Frontend');


    // 3. IMAGE DEFINITION (AMI)
    // Wir nehmen das neueste Amazon Linux 2023
    const machineImage = new ec2.AmazonLinuxImage({
      generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
    });

    // 4. BACKEND SERVER (Node.js)
    const backendServer = new ec2.Instance(this, 'BackendServer', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }, // Im Lab public, damit er Updates laden kann
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO), // Free Tier
      machineImage: machineImage,
      securityGroup: backendSG,
      // "User Data" - Das Boot-Skript
      userData: ec2.UserData.custom(`
        #!/bin/bash
        dnf install -y nodejs
        mkdir /opt/server
        echo "const http = require('http');
        const server = http.createServer((req, res) => {
          res.statusCode = 200;
          res.end('Hello from Backend EC2!');
        });
        server.listen(3000, '0.0.0.0');" > /opt/server/app.js
        # Starten im Hintergrund mit PM2 oder nohup (hier einfach nohup)
        nohup node /opt/server/app.js &
      `)
    });

    // 5. FRONTEND SERVER (Apache Webserver)
    const frontendServer = new ec2.Instance(this, 'FrontendServer', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: machineImage,
      securityGroup: frontendSG,
      userData: ec2.UserData.custom(`
        #!/bin/bash
        dnf install -y httpd
        systemctl start httpd
        systemctl enable httpd
        echo "<h1>Hello from Frontend EC2</h1><p>I am the web server.</p>" > /var/www/html/index.html
      `)
    });

    // Outputs: Damit wir die IPs direkt sehen
    new cdk.CfnOutput(this, 'FrontendURL', { value: `http://${frontendServer.instancePublicIp}` });
    new cdk.CfnOutput(this, 'BackendIP', { value: backendServer.instancePrivateIp });
  }
}