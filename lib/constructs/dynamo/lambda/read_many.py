# create a lambda function that will get all the records from the database with a given partition key, regardless of sort key

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

# create a function that will get all the records from the database with a given partition key, regardless of sort key values


def get_all_records(partition_key_value):
    response = table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key(
            partition_key).eq(partition_key_value)
    )
    return response['Items']


def lambda_handler(event, context):
    try:
        event = json.loads(event['body'])
        # check if keys are in body, if not add them from path parameters
        if partition_key not in list(event.keys()):
            event[partition_key] = event['pathParameters'][partition_key]
        logger.info(event)
        response = get_all_records(event[partition_key])
        logger.debug(response)
        statusCode = 200
        body = json.dumps(response)
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
