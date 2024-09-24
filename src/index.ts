import cors from 'cors';
import express, { Response, Request } from 'express';
import fileUpload, { UploadedFile } from 'express-fileupload';
import { apiKeyMiddleware } from './apiKeyMiddleware';
import dotenv from 'dotenv';
import axios from 'axios';
import FormData from 'form-data';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// File upload configuration
app.use(
  fileUpload({
    limits: { fileSize: 8 * 1024 * 1024 }, // 8MB file size limit
    abortOnLimit: true, // Stop upload if limit is exceeded
    createParentPath: true, // Automatically create parent folder if it doesn't exist
  })
);

// Middleware setup
app.use(cors());
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(apiKeyMiddleware); // Middleware for API key validation

// Basic GET route
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Hello World!',
  });
});

// Define interfaces for file and attachment handling
interface CustomFile {
  name: string;
  data: Buffer;
}

interface DiscordAttachment {
  id: string;
  filename: string;
  size: number;
  url: string;
  proxy_url: string;
}

/**
 * Upload file(s) to Discord using webhook URL from environment variables.
 * @param {UploadedFile | UploadedFile[]} file - File or array of files to be uploaded.
 * @returns {Promise<DiscordAttachment[]>} - A promise that resolves to the Discord attachments.
 */
const uploadToDiscord = async (
  file: UploadedFile | UploadedFile[]
): Promise<DiscordAttachment[]> => {
  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!discordWebhookUrl) {
    throw new Error(
      'Please specify your Discord webhook URL in the .env file using the "DISCORD_WEBHOOK_URL" key.'
    );
  }

  const formData = new FormData();

  if (Array.isArray(file)) {
    file.forEach((f, index) => {
      formData.append(`files[${index}]`, f.data, f.name);
    });
  } else {
    formData.append('file', file.data, file.name);
  }

  const { data } = await axios.post(discordWebhookUrl, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  if (!data?.attachments?.length) {
    throw new Error('No attachments found in the Discord response.');
  }

  return data.attachments as DiscordAttachment[];
};

/**
 * Convert a URL to a file-like object for upload.
 * @param {string} url - The URL of the file to be downloaded.
 * @returns {Promise<CustomFile>} - A promise that resolves to a file-like object.
 */
const urlToFile = async (url: string): Promise<CustomFile> => {
  const filename = url.substring(url.lastIndexOf('/') + 1).replace(/((\?|#).*)?$/, '');
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data);

  return {
    name: filename,
    data: buffer,
  };
};

/**
 * Convert one or multiple URLs to files.
 * @param {string | string[]} urls - A single URL or array of URLs.
 * @returns {Promise<CustomFile[]>} - A promise that resolves to an array of file-like objects.
 */
const urlsToFiles = async (urls: string | string[]): Promise<CustomFile[]> => {
  if (Array.isArray(urls)) {
    const promises = urls.map(url => urlToFile(url));
    return Promise.all(promises);
  }
  const file = await urlToFile(urls);
  return [file];
};

/**
 * File upload route, handles both file uploads and URL downloads.
 */
app.post('/upload', async (req: Request, res: Response) => {
  try {
    const { files, body } = req;
    console.log("files: ", files)
    console.log("body: ", body)
    if (!files?.file && !body?.url) {
      return res.status(400).json({
        success: false,
        message: 'Please specify files or URLs for upload.',
      });
    }

    let attachments: DiscordAttachment[] = [];

    if (files?.file) {
      attachments = await uploadToDiscord(files.file as UploadedFile | UploadedFile[]);
    } else if (body?.url) {
      const downloadedFiles = await urlsToFiles(body.url);
      attachments = await uploadToDiscord(downloadedFiles as unknown as UploadedFile[]);
    }

    return res.json({
      success: true,
      message: 'File uploaded successfully to Discord.',
      attachments,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred.',
    });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
