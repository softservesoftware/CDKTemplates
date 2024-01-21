import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as z from "zod";

// @TODO: add handling nullable types
// @TODO: add references to Zod documentation

export const convertZodSchemaToApiGatewayModel = <T extends Record<string, z.ZodSchema>>(
  schema: z.ZodObject<T>,
): apigateway.JsonSchema => {
  function convertScalarValueToSchema(field: z.ZodSchema<any>): apigateway.JsonSchema {
    let type: apigateway.JsonSchemaType | null = null;
    let enumValues: string[] | null = null;

    if (field instanceof z.ZodLiteral) {
      type = apigateway.JsonSchemaType.STRING;
      enumValues = [field.value];
    } else if (field instanceof z.ZodString) {
      type = apigateway.JsonSchemaType.STRING;
    } else if (field instanceof z.ZodNumber) {
      type = apigateway.JsonSchemaType.NUMBER;
    } else if (field instanceof z.ZodBoolean) {
      type = apigateway.JsonSchemaType.BOOLEAN;
    }

    if (type) {
      return Object.assign({ type }, ...[enumValues ? { enum: enumValues } : null].filter(Boolean));
    }

    console.error(field);
    throw new Error(`Unsupported field type: ${field}`);
  }

  function convertObjectToSchema(schema: z.ZodObject<Record<string, any>>): apigateway.JsonSchema {
    const properties: { [key: string]: apigateway.JsonSchema } = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(schema.shape)) {
      if (!(value as z.ZodSchema).isOptional()) {
        required.push(key);
      }

      if (value instanceof z.ZodUnion) {
        properties[key] = {
          oneOf: value.options.map(convertScalarOrObjectTypeToSchema),
        };
      } else if (value instanceof z.ZodArray) {
        properties[key] = {
          type: apigateway.JsonSchemaType.ARRAY,
          items: convertScalarOrObjectTypeToSchema(value.element),
        };
      } else if (value instanceof z.ZodObject) {
        properties[key] = convertObjectToSchema(value);
      } else {
        properties[key] = convertScalarValueToSchema(value);
      }
    }

    return {
      schema: apigateway.JsonSchemaVersion.DRAFT4,
      type: apigateway.JsonSchemaType.OBJECT,
      properties,
      required,
    };
  }

  function convertScalarOrObjectTypeToSchema(field: z.ZodSchema<any>): apigateway.JsonSchema {
    if (field instanceof z.ZodObject) {
      return convertObjectToSchema(field);
    }

    return convertScalarValueToSchema(field);
  }

  return convertObjectToSchema(schema);
};

convertZodSchemaToApiGatewayModel(
  z.object({
    name: z.string(),
    users: z.array(
      z.object({
        name: z.string(),
        email: z.string().email(),
        type: z.union([z.literal("admin"), z.literal("user")]),
      }),
    ),
    payload: z.union([
      z.object({ type: z.literal("payload_type_A"), value: z.string() }),
      z.object({ type: z.literal("payload_type_B"), value: z.number() }),
    ]),
  }),
);
