import express from 'express';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import fs from 'fs';
import { EventEmitter } from 'events';
import sharp from 'sharp';
import path from 'path';
import { products } from './storage.js';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;
const eventEmitter = new EventEmitter();
const logFile = 'filesUpload.log';
app.use(express.json());

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.statusCode || 500).json({
        status: 'error',
        message: err.message || 'Internal Server Error',
    });
});

const logEvent = (message) => {
    const logEntry = `${new Date().toLocaleString()} - ${message}\n`;
    fs.appendFile(logFile, logEntry, (err) => {
        if (err) console.error('Error writing to log file', err);
    });
};

eventEmitter.on('fileUploadStart', () => logEvent('File upload has started'));
eventEmitter.on('fileUploadEnd', () => logEvent('File has been uploaded'));
eventEmitter.on('fileUploadFailed', () => logEvent('Error occurred, file upload was failed'));

app.post('/product', (req, res, next) => {
    const { name, description, price } = req.body;
    if (!name || !description || !price) {
        return res.status(400).json({ message: 'Invalid product data' });
    }

    const newProduct = {
        id: randomUUID(),
        name,
        description,
        price,
        videos: [],
        images: [],
        previews: []
    };

    products.push(newProduct);
    fs.writeFileSync('products.store.json', JSON.stringify(products, null, 2));
    res.status(201).json(newProduct);
});

const handleFileUpload = (req, res, folder, productId) => {
    const product = products.find(p => p.id === productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const fileName = randomUUID() + path.extname(req.file.originalname);
    const filePath = path.join(folder, fileName);
    const writeStream = fs.createWriteStream(filePath);

    eventEmitter.emit('fileUploadStart');
    req.file.stream.pipe(writeStream);

    writeStream.on('finish', () => {
        eventEmitter.emit('fileUploadEnd');
        res.status(200).json({ fileName });
    });

    writeStream.on('error', (err) => {
        eventEmitter.emit('fileUploadFailed');
        res.status(500).json({ message: 'File upload failed', error: err });
    });
};


app.post('/product/:productId/image/upload', (req, res) => {
    const productId = req.params.productId;
    handleFileUpload(req, res, 'uploads/images', productId);
});


app.post('/product/:productId/video/upload', (req, res) => {
    const productId = req.params.productId;
    handleFileUpload(req, res, 'uploads/videos', productId);
});


const createImageThumbnail = (imagePath, thumbnailPath) => {
    return sharp(imagePath)
        .resize(150, 150)
        .toFile(thumbnailPath);
};


app.get('/product/image/:fileName', (req, res) => {
    const filePath = path.join('uploads/images', req.params.fileName);
    res.sendFile(filePath, { root: '.' });
});


app.get('/product/video/:fileName', (req, res) => {
    const filePath = path.join('uploads/videos', req.params.fileName);
    res.sendFile(filePath, { root: '.' });
});


app.post('/product/:productId/image/upload', (req, res) => {
    const productId = req.params.productId;
    const fileName = randomUUID() + path.extname(req.file.originalname);
    const filePath = path.join('uploads/images', fileName);
    const thumbnailPath = path.join('uploads/previews', 'thumb-' + fileName);

    const writeStream = fs.createWriteStream(filePath);

    req.file.stream.pipe(writeStream);

    writeStream.on('finish', () => {
        createImageThumbnail(filePath, thumbnailPath)
            .then(() => {
                const product = products.find(p => p.id === productId);
                if (product) {
                    product.images.push(fileName);
                    product.previews.push('thumb-' + fileName);
                    fs.writeFileSync('products.store.json', JSON.stringify(products, null, 2));
                    res.status(200).json({ message: 'Image uploaded', fileName });
                }
            })
            .catch(err => {
                res.status(500).json({ message: 'Error creating thumbnail', error: err });
            });
    });
});


app.get('/product/preview/:fileName', (req, res) => {
    const filePath = path.join('uploads/previews', req.params.fileName);
    res.sendFile(filePath, { root: '.' });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
