import { Request, Response, NextFunction } from 'express'
require('dotenv').config()

export const apiKeyMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const serverApiKey = process.env.API_KEY || ''
  const apiKey = req.headers['x-api-key']; // Lấy API key từ header
  if (serverApiKey === apiKey) {
    // Nếu API key hợp lệ, cho phép tiếp tục
    next();
  } else {
    // Nếu không hợp lệ, trả về lỗi
    res.status(403).json({ message: 'Invalid API key!' });
  }
};