import type { Request, Response } from 'express'

export async function getPayUInfo(req: Request, res: Response) {
  console.log('Body:', req.body)
  console.log('Headers:', req.headers)
  console.log('Params:', req.params)
  console.log('Query:', req.query)
  res.json('ok')
}
