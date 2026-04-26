import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function uploadPhoto(
  fileBuffer: Buffer,
  folder: string
): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: `snapcard/${folder}`,
          resource_type: "image",
          format: "jpg",
          transformation: [{ quality: "auto", fetch_format: "auto" }],
        },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error("Upload failed"));
            return;
          }
          resolve({ url: result.secure_url, publicId: result.public_id });
        }
      )
      .end(fileBuffer);
  });
}

export async function uploadSellerLogo(
  fileBuffer: Buffer,
  userId: string,
): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: `snapcard/assets/logos/${userId}`,
          resource_type: "image",
          public_id: "seller-logo",
          overwrite: true,
          invalidate: true,
        },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error("Logo upload failed"));
            return;
          }

          const url = cloudinary.url(result.public_id, {
            secure: true,
            version: result.version,
            width: 800,
            crop: "limit",
            quality: "auto",
            fetch_format: "auto",
          });

          resolve({ url, publicId: result.public_id });
        }
      )
      .end(fileBuffer);
  });
}

export { cloudinary };
