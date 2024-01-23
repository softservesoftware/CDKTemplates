import json
import boto3
import os
import logging

# Configure logging level based on environment variable or default to 'INFO'
LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO').upper()
logging.basicConfig(level=LOG_LEVEL)
logger = logging.getLogger()
table = boto3.resource('dynamodb').Table(os.environ['TABLE_NAME'])
partition_key = os.environ['PARTITION_KEY']
sort_key = os.environ['SORT_KEY']

# build parameters for DynamoDB's update_item method.
# this is a little annoying but its the "best practice" way to do it
# Args:
# - data (dict): Dictionary containing attributes to be updated.
# Returns:
# - tuple: UpdateExpression, ExpressionAttributeValues, and ExpressionAttributeNames


def build_update_parameters(data):
    # Initialize lists to construct the update expression
    update_expression = []
    expression_values = {}
    expression_names = {}

    # Iterate over each key-value pair in the input data
    for key, value in data.items():
        # Skip primary and sort keys
        if key not in [partition_key, sort_key]:
            # If value is None, it indicates the key should be removed
            if value is None:
                update_expression.append(f"REMOVE #{key}")
                expression_names[f"#{key}"] = key
            # If the value is a list, use list_append to append items
            elif isinstance(value, list):
                update_expression.append(
                    f"SET #{key} = list_append(#{key}, :{key})")
                expression_values[f":{key}"] = value
                expression_names[f"#{key}"] = key
            # If the value is a dictionary, update each nested key-value pair
            elif isinstance(value, dict):
                for nested_key, nested_value in value.items():
                    nested_attr = f"{key}.{nested_key}"
                    update_expression.append(
                        f"SET #{nested_attr} = :{nested_attr}")
                    expression_values[f":{nested_attr}"] = nested_value
                    expression_names[f"#{nested_attr}"] = nested_key
            # For other data types, use a standard SET expression
            else:
                update_expression.append(f"SET #{key} = :{key}")
                expression_values[f":{key}"] = value
                expression_names[f"#{key}"] = key

    # Join all parts of the update expression into a single string
    final_update_expression = ', '.join(update_expression)
    return final_update_expression, expression_values, expression_names


def lambda_handler(event, context):
    try:
        event = json.loads(event['body'])
        # check if client_id and object_type are in body, if not add them from path parameters
        if partition_key not in event:
            event[partition_key] = event['pathParameters'][partition_key]
        if sort_key not in event:
            event[sort_key] = event['pathParameters'][sort_key]
        # Build parameters for the update
        update_expression, expression_values, expression_names = build_update_parameters(
            event)
        # Perform the update using the constructed parameters
        response = table.update_item(
            Key={
                partition_key: event[partition_key],
                sort_key: event[sort_key]
            },
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_values,
            ExpressionAttributeNames=expression_names
        )
        logger.debug(response)
        statusCode = 200
        body = json.dumps({'result': 'Success'})
    except Exception as e:
        logger.error(str(e))
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
