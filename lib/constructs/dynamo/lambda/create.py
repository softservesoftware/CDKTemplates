import json
import boto3
import time
import os
import logging
import uuid
import decimal
LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO').upper()
logging.basicConfig(level=LOG_LEVEL)
logger = logging.getLogger()
table = boto3.resource('dynamodb').Table(os.environ['TABLE_NAME'])
partition_key = os.environ['PARTITION_KEY']
sort_key = os.environ['SORT_KEY']


class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, decimal.Decimal):
            return int(obj)
        return json.JSONEncoder.default(self, obj)


def lambda_handler(event, context):
    try:
        event = json.loads(event['body'])
        # check if keys are in body, if not add them from path parameters
        if partition_key not in list(event.keys()):
            event[partition_key] = event['pathParameters'][partition_key]
        # generate uuid for sort key
        event[sort_key] = str(uuid.uuid4())
        logger.info(event)
        response = table.put_item(Item=event)
        logger.debug(response)
        statusCode = 200
        body = json.dumps({'result': 'Success', sort_key: event[sort_key]})
    except Exception as e:
        logger.error(e)
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
