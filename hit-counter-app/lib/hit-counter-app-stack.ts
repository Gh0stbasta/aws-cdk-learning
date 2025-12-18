import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

/**
 * HitCounterAppStack ist unsere Haupt-CDK-Stack-Klasse.
 * Ein Stack ist wie ein Container für alle AWS-Ressourcen, die zusammengehören.
 * Alles was wir hier definieren, wird später als CloudFormation Stack deployed.
 */
export class HitCounterAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ═══════════════════════════════════════════════════════════════════
    // 1. DYNAMODB TABELLE - Unsere Datenbank für die Hit-Zähler
    // ═══════════════════════════════════════════════════════════════════
    
    const table = new dynamodb.Table(this, 'Hits', {
      // Der Partition Key ist der eindeutige Identifikator für jeden Eintrag.
      // Hier verwenden wir 'path' (z.B. "/home", "/about"), um Zugriffe
      // auf verschiedene Endpunkte zu zählen. Jeder Pfad bekommt einen eigenen Counter.
      partitionKey: { 
        name: 'path',                           // Name der Spalte
        type: dynamodb.AttributeType.STRING     // Datentyp: Text
      },
      
      // RemovalPolicy bestimmt, was beim Löschen des Stacks passiert.
      // DESTROY = Tabelle wird komplett gelöscht (gut für Dev/Test)
      // RETAIN = Tabelle bleibt bestehen (gut für Produktion mit wichtigen Daten)
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ═══════════════════════════════════════════════════════════════════
    // 2. LAMBDA FUNKTION - Das Herzstück unserer Logik
    // ═══════════════════════════════════════════════════════════════════
    
    const hitCounterFn = new lambda.Function(this, 'HitCounterHandler', {
      // Runtime: Welche Programmiersprache/Version verwendet wird
      runtime: lambda.Runtime.NODEJS_18_X,
      
      // Code-Quelle: Der 'lambda' Ordner wird gepackt und hochgeladen
      // CDK sucht automatisch nach JavaScript/TypeScript Dateien darin
      code: lambda.Code.fromAsset('lambda'),
      
      // Handler: Welche Datei und Funktion aufgerufen wird
      // Format: "dateiname.funktionsname"
      // Hier: lambda/hitcounter.js -> export.handler = ...
      handler: 'hitcounter.handler',
      
      // Environment Variables: Wie Konfigurationswerte für unseren Code
      // Diese können wir in der Lambda-Funktion mit process.env.VARIABLENNAME auslesen
      environment: {
        // Wir übergeben den Namen der DynamoDB Tabelle.
        // Der Name wird von AWS automatisch generiert (z.B. "HitCounterAppStack-HitsXYZ123")
        // Dadurch muss unser Lambda-Code nicht hart-codiert wissen, wie die Tabelle heißt
        HITS_TABLE_NAME: table.tableName
      }
    });

    // ═══════════════════════════════════════════════════════════════════
    // 3. IAM BERECHTIGUNGEN - Wer darf was?
    // ═══════════════════════════════════════════════════════════════════
    
    // In AWS hat standardmäßig nichts Zugriff auf irgendetwas (Least Privilege Prinzip).
    // Diese Zeile erstellt automatisch eine IAM Policy, die unserer Lambda-Funktion
    // erlaubt, Daten in der DynamoDB Tabelle zu lesen UND zu schreiben.
    // Ohne diese Zeile würde Lambda einen "Access Denied" Fehler bekommen.
    table.grantReadWriteData(hitCounterFn);

    // ═══════════════════════════════════════════════════════════════════
    // 4. API GATEWAY - Der öffentliche Eingang (HTTP Endpoint)
    // ═══════════════════════════════════════════════════════════════════
    
    // LambdaRestApi erstellt automatisch:
    // - Einen REST API Endpunkt (https://xyz123.execute-api.region.amazonaws.com/prod/)
    // - Eine Standard-Route, die ALLE HTTP-Requests (GET, POST, etc.) an unsere Lambda weiterleitet
    // - Die nötigen Berechtigungen, damit API Gateway unsere Lambda aufrufen darf
    // 
    // Nach dem Deployment bekommen wir eine URL, die wir im Browser öffnen können.
    new apigw.LambdaRestApi(this, 'Endpoint', {
      handler: hitCounterFn  // Verbindet das API Gateway mit unserer Lambda-Funktion
    });
    
    // Das war's! CDK kümmert sich nun um:
    // - CloudFormation Template Generierung
    // - Hochladen des Lambda-Codes nach S3
    // - Erstellen aller Ressourcen in der richtigen Reihenfolge
    // - Verknüpfen aller Berechtigungen und Abhängigkeiten
  }
}