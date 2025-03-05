export default async function (
  obj: object,
  schemaType: any,
  schemaName: string,
  res: any
) {
  try {
    await schemaType.validateAsync(obj);
  } catch (error: any) {
    console.log({
      vERR: error,
      Deets: error.details,
      Deets2: { path: error.details.path, context: error.details.context },
      schemaName,
    });
    return res.status(400).send(`${schemaName}: Bad request.`);
  }
}
