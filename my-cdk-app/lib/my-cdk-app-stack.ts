import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
// Wir importieren S3 und das Deployment-Modul
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';

export class MyCdkAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. Der S3 Bucket
    const myBucket = new s3.Bucket(this, 'MyFirstBucket', {
      versioned: true,
      // WICHTIG für Lernumgebungen:
      // Wenn wir den Stack löschen (`cdk destroy`), soll auch der Bucket weg.
      // AWS löscht standardmäßig KEINE Buckets mit Inhalt.
      // `autoDeleteObjects` leert ihn vorher, `DESTROY` erlaubt das Löschen.
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      
      // Website-Hosting aktivieren
      websiteIndexDocument: 'index.html',
      publicReadAccess: true, // Achtung: Macht den Bucket öffentlich lesbar!
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS_ONLY, // Erlaubt Bucket Policies (nötig für publicReadAccess)
    });

    // 2. Das Deployment (lädt den Ordnerinhalt hoch)
    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.asset('./website')], // Pfad zu deinem Ordner
      destinationBucket: myBucket,
    });

    // 3. Output: Zeig uns die URL nach dem Deploy an
    new cdk.CfnOutput(this, 'WebsiteURL', {
      value: myBucket.bucketWebsiteUrl,
    });
  }
}