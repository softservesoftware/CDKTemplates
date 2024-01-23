# lambda function that will trigger each time a record is changed in the dynamodb table
import json
import boto3
import os
from io import StringIO
import logging

from boto3.dynamodb.types import TypeDeserializer
LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO').upper()
logging.basicConfig(level=LOG_LEVEL)
logger = logging.getLogger()


export_table = os.environ['TABLE_NAME']
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(export_table)
partition_key = os.environ['PARTITION_KEY']
sort_key = os.environ['SORT_KEY']


# helper function to update a dynamodb record with the s3 link and status
def update_dynamodb_record(partition_key_value, sort_key_value, key_to_update, update_value):
    response = table.update_item(
        Key={
            partition_key: partition_key_value,
            sort_key: sort_key_value
        },
        UpdateExpression=f"set {key_to_update}=:{key_to_update}",
        ExpressionAttributeValues={
            f':{key_to_update}': update_value,
        },
        ReturnValues="UPDATED_NEW"
    )
    return response


def lambda_handler(event, context):
    deserializer = TypeDeserializer()
    for record in event['Records']:
        logger.info(f"Record: {record}")
        event_name = record['eventName']
        logger.info(f"Processing {event_name} event")
        if event_name == 'INSERT':
            logger.info("Processing INSERT event")
            new_image = record['dynamodb']['NewImage']
            item = {k: deserializer.deserialize(
                v) for k, v in new_image.items()}

            # Process 'item' as needed
            try:
                logger.info(f"Item: {item}")
            except Exception as e:
                logger.error(e)
                raise e  # Rethrow the exception to signal Lambda execution failure

        elif event_name == 'MODIFY':
            # Add handling for MODIFY event if needed
            logger.info("Processing MODIFY event")
    return {
        'statusCode': 200,
        'body': json.dumps("Event processed successfully"),
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': True
        }
    }
