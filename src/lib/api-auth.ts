import { NextRequest } from 'next/server'

export function validateApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key')
  return apiKey === process.env.INTERNAL_API_KEY
}

export function unauthorizedResponse() {
  return Response.json(
    { error: 'Unauthorized — invalid or missing x-api-key' },
    { status: 401 }
  )
}