const FALLBACK_CHUNK_BYTES = 5 * 1024 * 1024;

async function parseJson(response) {
  return response.json().catch(() => ({}));
}

function buildUploadError(response, payload) {
  const error = new Error(payload?.error || `HTTP_${response.status}`);
  error.status = response.status;
  error.code = payload?.error || "";
  if (Number.isFinite(Number(payload?.uploadedBytes))) {
    error.uploadedBytes = Number(payload.uploadedBytes);
  }
  if (Number.isFinite(Number(payload?.maxBytes))) {
    error.maxBytes = Number(payload.maxBytes);
  }
  if (Number.isFinite(Number(payload?.chunkSizeBytes))) {
    error.chunkSizeBytes = Number(payload.chunkSizeBytes);
  }
  return error;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await parseJson(response);
  if (!response.ok) {
    throw buildUploadError(response, payload);
  }
  return payload;
}

export async function uploadFileInChunks({
  file,
  initUrl,
  completeUrl,
  abortUrl,
  buildChunkUrl,
  headers,
  initBody,
  onProgress,
}) {
  if (!file) return null;

  let session = null;
  try {
    session = await requestJson(initUrl, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...initBody,
        fileName: file.name || "upload.bin",
        contentType: file.type || "application/octet-stream",
        sizeBytes: Number(file.size || 0),
      }),
    });

    const totalBytes = Number(file.size || 0);
    let offset = Number(session?.uploadedBytes || 0);
    const chunkSizeBytes = Math.max(
      64 * 1024,
      Math.min(
        Number(session?.chunkSizeBytes || FALLBACK_CHUNK_BYTES),
        FALLBACK_CHUNK_BYTES,
      ),
    );

    while (offset < totalBytes) {
      const nextOffset = Math.min(offset + chunkSizeBytes, totalBytes);
      const chunk = file.slice(offset, nextOffset);
      const response = await fetch(buildChunkUrl(session.uploadId, offset), {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/octet-stream",
        },
        body: chunk,
      });
      const payload = await parseJson(response);

      if (!response.ok) {
        if (
          response.status === 409 &&
          Number.isFinite(Number(payload?.uploadedBytes))
        ) {
          offset = Number(payload.uploadedBytes);
          continue;
        }
        throw buildUploadError(response, payload);
      }

      offset = Number.isFinite(Number(payload?.uploadedBytes))
        ? Number(payload.uploadedBytes)
        : nextOffset;

      if (typeof onProgress === "function") {
        onProgress({
          uploadedBytes: offset,
          totalBytes,
          file,
          session,
        });
      }
    }

    const completed = await requestJson(completeUrl(session.uploadId), {
      method: "POST",
      headers: {
        ...headers,
      },
    });

    if (typeof onProgress === "function") {
      onProgress({
        uploadedBytes: totalBytes,
        totalBytes,
        file,
        session,
        complete: true,
      });
    }

    return completed;
  } catch (error) {
    if (session?.uploadId && abortUrl) {
      fetch(abortUrl(session.uploadId), {
        method: "DELETE",
        headers: {
          ...headers,
        },
      }).catch(() => {});
    }
    throw error;
  }
}
