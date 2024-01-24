export const handler = async (event: Record<string, any>) => {
    return {
        statusCode: 200,
        body: JSON.stringify(event),
    };
};