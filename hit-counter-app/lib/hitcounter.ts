import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

/**
 * Interface für die Properties des HitCounter-Constructs.
 * Definiert, welche Konfigurationsparameter beim Erstellen übergeben werden müssen.
 */
export interface HitCounterProps {
    /** 
     * Die nachgelagerte Lambda-Funktion, für die wir Hits zählen wollen.
     * Diese Funktion wird nach dem Zählen aufgerufen.
     */
    downstream: lambda.IFunction;
}

/**
 * HitCounter ist ein wiederverwendbares Construct, das eine DynamoDB-Tabelle
 * und eine Lambda-Funktion erstellt, um HTTP-Aufrufe zu zählen.
 * 
 * Funktionsweise:
 * 1. Jeder Request kommt zuerst bei der HitCounter-Lambda an
 * 2. Die Lambda speichert den Pfad und inkrementiert einen Zähler in DynamoDB
 * 3. Danach wird die eigentliche (downstream) Lambda-Funktion aufgerufen
 */
export class HitCounter extends Construct {

    /**
     * Die öffentlich zugängliche Lambda-Funktion, die als Einstiegspunkt dient.
     * Andere Services (z.B. API Gateway) können diese Funktion aufrufen.
     * 'readonly' bedeutet, dass sie nach der Initialisierung nicht mehr geändert werden kann.
     */
    public readonly handler: lambda.Function;

    /**
     * Die DynamoDB-Tabelle, in der die Hit-Zähler gespeichert werden.
     * Wird öffentlich gemacht, falls andere Constructs darauf zugreifen müssen
     * (z.B. für zusätzliche Berechtigungen oder zum Auslesen der Daten).
     */
    public readonly table: dynamodb.Table;

    /**
     * Constructor - wird aufgerufen, wenn eine neue Instanz von HitCounter erstellt wird.
     * 
     * @param scope - Der übergeordnete Construct (normalerweise der Stack)
     * @param id - Ein eindeutiger Identifier für dieses Construct innerhalb des Scopes
     * @param props - Die Konfigurationsparameter (siehe HitCounterProps Interface)
     */
    constructor(scope: Construct, id: string, props: HitCounterProps) {
        // Ruft den Constructor der Elternklasse (Construct) auf - zwingend erforderlich!
        super(scope, id);

        // ===== SCHRITT 1: DynamoDB-Tabelle erstellen =====
        // Die Tabelle speichert den Pfad als Schlüssel und die Anzahl der Hits
        this.table = new dynamodb.Table(this, 'Hits', {
            // Partition Key: Der Primärschlüssel der Tabelle
            // Jeder eindeutige Pfad (z.B. "/", "/hello") wird eine eigene Zeile
            partitionKey: { 
                name: 'path',                           // Spaltenname in der Tabelle
                type: dynamodb.AttributeType.STRING     // Datentyp: String
            },
            
            // Was passiert beim Löschen des Stacks?
            // DESTROY = Tabelle wird komplett gelöscht (gut für Entwicklung/Tests)
            // Alternativen: RETAIN (Tabelle bleibt bestehen) oder SNAPSHOT (Backup erstellen)
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            
            // Abrechnungsmodus: PAY_PER_REQUEST (On-Demand)
            // Du zahlst nur für tatsächliche Lese-/Schreibvorgänge
            // Alternative: PROVISIONED (feste Kapazität reservieren)
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST
        });

        // ===== SCHRITT 2: Lambda-Funktion erstellen =====
        // Diese Funktion wird bei jedem Request aufgerufen, zählt den Hit und ruft dann
        // die eigentliche (downstream) Funktion auf
        this.handler = new lambda.Function(this, 'HitCounterHandler', {
            // Node.js Version 18.x als Runtime-Umgebung
            runtime: lambda.Runtime.NODEJS_18_X,
            
            // Handler-Definition: <dateiname>.<exportierte-funktion>
            // AWS sucht nach einer Datei "hitcounter.js" mit einer exportierten "handler"-Funktion
            handler: 'hitcounter.handler',
            
            // Wo liegt der Code? Im Verzeichnis "lambda" (relativ zur CDK-App)
            // CDK packt automatisch alle Dateien aus diesem Ordner und lädt sie zu AWS hoch
            code: lambda.Code.fromAsset('lambda'),
            
            // Umgebungsvariablen, die in der Lambda-Funktion verfügbar sind
            // Diese können im Code über process.env.VARIABLE_NAME abgerufen werden
            environment: {
                // Der Name der DynamoDB-Tabelle (wird dynamisch zur Deployment-Zeit eingefügt)
                // Die Lambda kann so auf die Tabelle zugreifen, ohne den Namen fest zu codieren
                HITS_TABLE_NAME: this.table.tableName,
                
                // Der Name der nachgelagerten Lambda-Funktion
                // Damit weiß unsere HitCounter-Lambda, welche Funktion sie nach dem Zählen aufrufen soll
                DOWNSTREAM_FUNCTION_NAME: props.downstream.functionName
            }
        });

        // ===== SCHRITT 3: IAM-Berechtigungen vergeben =====
        
        // Erlaubt der HitCounter-Lambda, Daten in die Tabelle zu schreiben und zu lesen
        // CDK erstellt automatisch die notwendigen IAM-Policies im Hintergrund
        // Ohne diese Berechtigung würde die Lambda einen "Access Denied"-Fehler bekommen
        this.table.grantReadWriteData(this.handler);
        
        // Erlaubt der HitCounter-Lambda, die downstream-Lambda aufzurufen
        // Das ist wichtig, damit nach dem Zählen die eigentliche Business-Logik ausgeführt werden kann
        // Auch hier erstellt CDK automatisch die passenden IAM-Policies
        props.downstream.grantInvoke(this.handler);
    }
}