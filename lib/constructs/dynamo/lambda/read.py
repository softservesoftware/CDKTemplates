import json
import boto3
import os
import logging
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
        return super(DecimalEncoder, self).default(obj)


def lambda_handler(event, context):
    logger.debug(event)
    # Initialize an empty dictionary for query_params
    query_params = event.get('queryStringParameters') or {}
    try:
        # Extract 'attributes' parameter if present
        attributes = query_params.get('attributes')
        key = {
            partition_key: event['pathParameters'][partition_key],
            sort_key: event['pathParameters'][sort_key]
        }
        if attributes:
            # attributes is a comma-separated string of attributes to return
            attributes_list = attributes.split(',')
            response = table.get_item(
                Key=key,
                ProjectionExpression=", ".join(attributes_list)
            )
        else:
            response = table.get_item(Key=key)
        logger.debug(response)
        statusCode = 200
        body = json.dumps(response.get('Item', {}), cls=DecimalEncoder)
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
