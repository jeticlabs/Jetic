export async function GET() {
  return Response.json({});
}

export async function DELETE() {
  return new Response(null, { status: 204 });
}
