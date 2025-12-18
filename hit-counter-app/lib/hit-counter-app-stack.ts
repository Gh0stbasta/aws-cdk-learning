import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import { HitCounter } from './hitcounter'; // Importiert unser eigenes Custom Construct für den Hit-Counter

/**
 * HitCounterAppStack
 * 
 * Dieser Stack erstellt eine vollständige Serverless-Anwendung mit folgenden Komponenten:
 * - Eine Lambda-Funktion als Backend (Geschäftslogik)
 * - Ein HitCounter-Wrapper, der Zugriffe zählt
 * - Ein API Gateway als öffentlicher HTTP-Endpunkt
 */
export class HitCounterAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. Erstelle die Haupt-Lambda-Funktion (unsere eigentliche Geschäftslogik)
    // Diese Funktion gibt einfach eine "Hello Architect!" Nachricht zurück
    const helloFn = new lambda.Function(this, 'HelloHandler', {
      // Runtime-Umgebung: Node.js 18.x
      runtime: lambda.Runtime.NODEJS_18_X,
      
      // Code wird inline definiert (für Produktionsumgebungen würde man normalerweise externe Dateien verwenden)
      // Die Funktion gibt einen HTTP 200 Status mit einer Begrüßungsnachricht zurück
      code: lambda.Code.fromInline('exports.handler = async () => { return { statusCode: 200, body: "Hello Architect!" }; };'),
      
      // Handler-Methode: 'index.handler' bedeutet, dass die Funktion 'handler' in der Datei 'index' aufgerufen wird
      handler: 'index.handler'
    });

    // 2. Umhülle die Lambda-Funktion mit unserem Custom HitCounter Construct
    // Der HitCounter sitzt "vor" der eigentlichen Lambda-Funktion und:
    // - Zählt jeden Aufruf in einer DynamoDB-Tabelle
    // - Leitet dann die Anfrage an die downstream-Funktion (helloFn) weiter
    const helloWithCounter = new HitCounter(this, 'HelloHitCounter', {
      // Die downstream-Funktion ist unsere helloFn - sie wird nach dem Zählen aufgerufen
      downstream: helloFn
    });

    // 3. Erstelle ein API Gateway REST API
    // Dies ist der öffentliche HTTP-Endpunkt, den Benutzer aufrufen können
    // Der Handler zeigt auf den HitCounter (nicht direkt auf helloFn!)
    // Request-Flow: API Gateway -> HitCounter Lambda -> DynamoDB (Zähler erhöhen) -> helloFn -> Response
    new apigw.LambdaRestApi(this, 'Endpoint', {
      // Der Handler ist die Lambda-Funktion des HitCounters, die dann die downstream-Funktion aufruft
      handler: helloWithCounter.handler
    });
  }
}