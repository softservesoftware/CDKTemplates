import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as z from "zod";

// @TODO: add handling nullable types
// @TODO: add references to Zod documentation

export const isScalarZodType = (field: z.ZodSchema<any>): boolean => {
  return [
    z.ZodLiteral,
    z.ZodString,
    z.ZodNumber,
    z.ZodBigInt,
    z.ZodBoolean,
  ].some((type) => field instanceof type);
};

export const convertZodSchemaToApiGatewayModel = <T extends Record<string, z.ZodSchema>>(
  schema: z.ZodObject<T>,
): apigateway.JsonSchema => {
  function convertScalarValueToSchema(field: z.ZodSchema<any>): apigateway.JsonSchema {
    if (field instanceof z.ZodLiteral) {
      return {
        type: apigateway.JsonSchemaType.STRING,
        enum: [field.value],
      };
    }

    if (field instanceof z.ZodString) {
      return {
        type: apigateway.JsonSchemaType.STRING,
      };
    }

    if (field instanceof z.ZodNumber) {
      return {
        type: apigateway.JsonSchemaType.NUMBER,
      };
    }

    if (field instanceof z.ZodBigInt) {
      return {
        type: apigateway.JsonSchemaType.INTEGER,
        format: "int64",
      };
    }

    if (field instanceof z.ZodBoolean) {
      return {
        type: apigateway.JsonSchemaType.BOOLEAN,
      };
    }

    console.error(field);
    throw new Error(`Unsupported field type: ${field}`);
  }

  function convertZodTypeToJsonSchemaType(value: z.ZodSchema<any>): apigateway.JsonSchema {
    if (value instanceof z.ZodNull) {
      return {
        type: apigateway.JsonSchemaType.NULL,
      };
    } else if (
      value instanceof z.ZodUndefined ||
      value instanceof z.ZodVoid ||
      value instanceof z.ZodNever ||
      value instanceof z.ZodNaN
    ) {
      return {
        not: {},
      };
    } else if (value instanceof z.ZodUnknown) {
      return {};
    } else if (value instanceof z.ZodDate) {
      return {
        type: apigateway.JsonSchemaType.STRING,
        format: "date-time",
      };
    } else if (value instanceof z.ZodNativeEnum) {
      const enumDef = value.enum;

      const actualKeys = Object.keys(value.enum).filter((key: string) => {
        return typeof enumDef[enumDef[key]] !== "number";
      });

      const actualValues = actualKeys.map((key: string) => enumDef[key]);

      const parsedTypes = Array.from(
        new Set(
          actualValues.map((values: string | number) =>
            typeof values === "string" ? apigateway.JsonSchemaType.STRING : apigateway.JsonSchemaType.NUMBER,
          ),
        ),
      );

      return {
        type: parsedTypes.length === 1 ? parsedTypes[0] : parsedTypes,
        enum: actualValues,
      };
    } else if (value instanceof z.ZodEnum) {
      return {
        type: apigateway.JsonSchemaType.STRING,
        enum: value.options,
      };
    } else if (value instanceof z.ZodUnion || value instanceof z.ZodDiscriminatedUnion) {
      return {
        oneOf: value.options.map(convertScalarOrObjectTypeToSchema),
      };
    } else if (value instanceof z.ZodIntersection) {
      return {
        allOf: [
          convertScalarOrObjectTypeToSchema(value._def.left),
          convertScalarOrObjectTypeToSchema(value._def.right),
        ].filter(Boolean),
      };
    } else if (value instanceof z.ZodTuple) {
      return {
        type: apigateway.JsonSchemaType.ARRAY,
        items: value.items.map(convertScalarOrObjectTypeToSchema),
        minItems: value.items.length,
      };
    } else if (value instanceof z.ZodArray) {
      return {
        type: apigateway.JsonSchemaType.ARRAY,
        items: convertScalarOrObjectTypeToSchema(value.element),
      };
    } else if (value instanceof z.ZodObject) {
      return convertObjectToSchema(value);
    } else if (value instanceof z.ZodOptional || value instanceof z.ZodNullable) {
      return convertScalarOrObjectTypeToSchema(value.unwrap());
    } else if (value instanceof z.ZodLazy) {
      return convertScalarOrObjectTypeToSchema(value.schema);
    } else if (value instanceof z.ZodRecord) {
      throw new Error("ZodRecord is not supported");
    } else if (value instanceof z.ZodFunction) {
      throw new Error("ZodFunction is not supported");
    } else if (value instanceof z.ZodMap) {
      throw new Error("ZodMap is not supported");
    } else if (value instanceof z.ZodSet) {
      throw new Error("ZodSet is not supported");
    }

    return convertScalarValueToSchema(value);
  }

  function convertObjectToSchema(schema: z.ZodObject<Record<string, any>>): apigateway.JsonSchema {
    const properties: { [key: string]: apigateway.JsonSchema } = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(schema.shape)) {
      if (!(value as z.ZodSchema).isOptional() && !(value as z.ZodSchema).isNullable()) {
        required.push(key);
      }

      properties[key] = convertZodTypeToJsonSchemaType(value);

      // if (value instanceof z.ZodNull) {
      //   properties[key] = {
      //     type: apigateway.JsonSchemaType.NULL,
      //   };
      // } else if (
      //   value instanceof z.ZodUndefined ||
      //   value instanceof z.ZodVoid ||
      //   value instanceof z.ZodNever ||
      //   value instanceof z.ZodNaN
      // ) {
      //   properties[key] = {
      //     not: {},
      //   };
      // } else if (value instanceof z.ZodUnknown) {
      //   properties[key] = {};
      // } else if (value instanceof z.ZodDate) {
      //   properties[key] = {
      //     type: apigateway.JsonSchemaType.STRING,
      //     format: "date-time",
      //   };
      // } else if (value instanceof z.ZodNativeEnum) {
      //   const enumDef = value.enum;

      //   const actualKeys = Object.keys(value.enum).filter((key: string) => {
      //     return typeof enumDef[enumDef[key]] !== "number";
      //   });

      //   const actualValues = actualKeys.map((key: string) => enumDef[key]);

      //   const parsedTypes = Array.from(
      //     new Set(
      //       actualValues.map((values: string | number) =>
      //         typeof values === "string" ? apigateway.JsonSchemaType.STRING : apigateway.JsonSchemaType.NUMBER,
      //       ),
      //     ),
      //   );

      //   properties[key] = {
      //     type: parsedTypes.length === 1 ? parsedTypes[0] : parsedTypes,
      //     enum: actualValues,
      //   };
      // } else if (value instanceof z.ZodEnum) {
      //   properties[key] = {
      //     type: apigateway.JsonSchemaType.STRING,
      //     enum: value.options,
      //   };
      // } else if (value instanceof z.ZodUnion || value instanceof z.ZodDiscriminatedUnion) {
      //   properties[key] = {
      //     oneOf: value.options.map(convertScalarOrObjectTypeToSchema),
      //   };
      // } else if (value instanceof z.ZodIntersection) {
      //   properties[key] = {
      //     allOf: [
      //       convertScalarOrObjectTypeToSchema(value._def.left),
      //       convertScalarOrObjectTypeToSchema(value._def.right),
      //     ].filter(Boolean),
      //   };
      // } else if (value instanceof z.ZodTuple) {
      //   properties[key] = {
      //     type: apigateway.JsonSchemaType.ARRAY,
      //     items: value.items.map(convertScalarOrObjectTypeToSchema),
      //     minItems: value.items.length,
      //   };
      // } else if (value instanceof z.ZodArray) {
      //   properties[key] = {
      //     type: apigateway.JsonSchemaType.ARRAY,
      //     items: convertScalarOrObjectTypeToSchema(value.element),
      //   };
      // } else if (value instanceof z.ZodObject) {
      //   properties[key] = convertObjectToSchema(value);
      // } else if (value instanceof z.ZodOptional || value instanceof z.ZodNullable) {
      //   properties[key] = convertScalarOrObjectTypeToSchema(value.unwrap());
      // } else if (value instanceof z.ZodLazy) {
      //   properties[key] = convertScalarOrObjectTypeToSchema(value.schema);
      // } else if (value instanceof z.ZodRecord) {
      //   throw new Error("ZodRecord is not supported");
      // } else if (value instanceof z.ZodFunction) {
      //   throw new Error("ZodFunction is not supported");
      // } else if (value instanceof z.ZodMap) {
      //   throw new Error("ZodMap is not supported");
      // } else if (value instanceof z.ZodSet) {
      //   throw new Error("ZodSet is not supported");
      // } else {
      //   properties[key] = convertScalarValueToSchema(value);
      // }

      // if (value.isNullable() && properties[key]) {
      //   (properties[key] as any).type = [properties[key].type, apigateway.JsonSchemaType.NULL];
      // }
    }

    return {
      schema: apigateway.JsonSchemaVersion.DRAFT7,
      type: apigateway.JsonSchemaType.OBJECT,
      properties,
      required,
    };
  }

  function convertScalarOrObjectTypeToSchema(field: z.ZodSchema<any>): apigateway.JsonSchema {
    return convertZodTypeToJsonSchemaType(field);
    // if (isScalarZodType(field)) {
    //   return convertScalarValueToSchema(field);
    // }

    // return convertObjectToSchema(field as any);
  }

  return convertObjectToSchema(schema);
};

convertZodSchemaToApiGatewayModel(
  z.object({
    value: z.string(),
  })
)