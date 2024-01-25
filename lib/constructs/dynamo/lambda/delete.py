import json
import boto3
import os
import logging

LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO').upper()
logging.basicConfig(level=LOG_LEVEL)
logger = logging.getLogger()
table = boto3.resource('dynamodb').Table(os.environ['TABLE_NAME'])
partition_key = os.environ['PARTITION_KEY']
sort_key = os.environ['SORT_KEY']


def lambda_handler(event, context):
    try:
        event = json.loads(event['body'])
        # check if keys are in body, if not add them from path parameters
        if partition_key not in list(event.keys()):
            event[partition_key] = event['pathParameters'][partition_key]
        if sort_key not in list(event.keys()):
            event[sort_key] = event['pathParameters'][sort_key]
        response = table.delete_item(
            Key={
                partition_key: event[partition_key],
                sort_key: event[sort_key]
            }
        )
        logging.debug(response)
        statusCode = 200
        body = json.dumps({'result': 'Success'})
    except Exception as e:
        logging.error(e)
        statusCode = 500
        body = json.dumps({'result': 'Failure'})
    return {
        'statusCode': statusCode,
        'body': body,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': True
        }
    }
