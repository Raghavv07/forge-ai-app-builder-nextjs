import { getSupabaseBrowserClient } from "./client";

export const WORKSPACE_IMAGES_BUCKET = "workspace-images";
export const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
];

export interface UploadImageResult {
  success: boolean;
  url?: string;
  path?: string;
  error?: string;
}

export interface ImageTransformOptions {
  width?: number;
  height?: number;
  resize?: "cover" | "contain" | "fill";
  quality?: number;
  format?: "origin";
}

/**
 * Uploads an image file to Supabase Storage in the 'workspace-images' bucket.
 * Handles client validation, file type/size verification, path generation, and error mapping.
 */
export async function uploadWorkspaceImage(
  file: File,
  userId: string,
  workspaceId: string | null
): Promise<UploadImageResult> {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    return {
      success: false,
      error:
        "Supabase credentials are not configured. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.",
    };
  }

  // Validate MIME type
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return {
      success: false,
      error: "Invalid file type. Only JPEG, PNG, WebP, GIF, and SVG images are supported.",
    };
  }

  // Validate File Size (max 5MB)
  if (file.size > MAX_IMAGE_FILE_SIZE) {
    return {
      success: false,
      error: "Image exceeds 5MB limit. Please upload a smaller image file.",
    };
  }

  try {
    const rawExt = file.name.split(".").pop()?.toLowerCase();
    const safeExt = rawExt && /^[a-z0-9]+$/.test(rawExt) ? rawExt : "png";
    const randomSuffix = Math.random().toString(36).substring(2, 9);
    const path = `${userId}/${workspaceId ?? "new"}/${Date.now()}_${randomSuffix}.${safeExt}`;

    const { error: uploadError } = await supabase.storage
      .from(WORKSPACE_IMAGES_BUCKET)
      .upload(path, file, {
        upsert: true,
        cacheControl: "3600",
        contentType: file.type,
      });

    if (uploadError) {
      if (
        uploadError.message?.toLowerCase().includes("bucket not found") ||
        uploadError.message?.toLowerCase().includes("does not exist")
      ) {
        return {
          success: false,
          error:
            "Storage bucket 'workspace-images' was not found. Please create a public bucket named 'workspace-images' in Supabase dashboard -> Storage.",
        };
      }
      return {
        success: false,
        error: uploadError.message || "Failed to upload image to Supabase Storage.",
      };
    }

    const { data } = supabase.storage
      .from(WORKSPACE_IMAGES_BUCKET)
      .getPublicUrl(path);

    if (!data?.publicUrl) {
      return {
        success: false,
        error: "Could not retrieve public URL for the uploaded image.",
      };
    }

    return {
      success: true,
      url: data.publicUrl,
      path,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred during upload.";
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Retrieves the public URL for an asset in 'workspace-images' with optional Supabase image CDN transformations.
 */
export function getWorkspaceImageUrl(
  path: string,
  options?: { transform?: ImageTransformOptions; download?: boolean | string }
): string | null {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const { data } = supabase.storage
    .from(WORKSPACE_IMAGES_BUCKET)
    .getPublicUrl(path, options);

  return data.publicUrl;
}

/**
 * Creates a signed URL for a file in the workspace bucket (useful for time-limited secure access).
 */
export async function createSignedWorkspaceImageUrl(
  path: string,
  expiresIn: number = 3600,
  options?: { transform?: ImageTransformOptions; download?: boolean | string }
): Promise<{ signedUrl: string | null; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { signedUrl: null, error: "Supabase client is not configured." };
  }

  const { data, error } = await supabase.storage
    .from(WORKSPACE_IMAGES_BUCKET)
    .createSignedUrl(path, expiresIn, options);

  if (error) {
    return { signedUrl: null, error: error.message };
  }

  return { signedUrl: data?.signedUrl ?? null, error: null };
}

/**
 * Deletes an image from the 'workspace-images' bucket.
 */
export async function deleteWorkspaceImage(
  path: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { success: false, error: "Supabase client is not configured." };
  }

  const { error } = await supabase.storage
    .from(WORKSPACE_IMAGES_BUCKET)
    .remove([path]);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
