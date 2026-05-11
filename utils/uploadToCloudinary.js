const cloudinary = require('../config/cloudinary');

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Upload a file buffer to Cloudinary.
 * Automatically detects image vs video and applies appropriate settings.
 */
const uploadToCloudinary = (buffer, folder = 'blog-thumbnails', mimetype = 'image/jpeg') => {
  const isVideo = mimetype && mimetype.startsWith('video/');
  return new Promise((resolve, reject) => {
    const options = {
      folder,
      resource_type: isVideo ? 'video' : 'image',
    };
    // Only apply image transformation for images
    if (!isVideo) {
      options.transformation = [{ width: 1200, height: 630, crop: 'fill' }];
    }
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
    stream.end(buffer);
  });
};

const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  if (!publicId) return;
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
};

module.exports = { uploadToCloudinary, deleteFromCloudinary };
