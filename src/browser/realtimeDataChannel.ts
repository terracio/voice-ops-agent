export function waitForRealtimeDataChannelOpen(
  dataChannel: RTCDataChannel,
  timeoutMs = 10_000
): Promise<void> {
  if (dataChannel.readyState === "open") return Promise.resolve();
  if (dataChannel.readyState === "closed") {
    return Promise.reject(new Error("Realtime data channel closed before opening."));
  }

  return new Promise((resolve, reject) => {
    const previousClose = dataChannel.onclose;
    const previousError = dataChannel.onerror;
    const previousOpen = dataChannel.onopen;

    const restore = () => {
      if (timeout) clearTimeout(timeout);
      dataChannel.onclose = previousClose;
      dataChannel.onerror = previousError;
      dataChannel.onopen = previousOpen;
    };

    const timeout = setTimeout(() => {
      restore();
      reject(new Error("Realtime data channel timed out before opening."));
    }, timeoutMs);

    dataChannel.onopen = (event) => {
      restore();
      previousOpen?.call(dataChannel, event);
      resolve();
    };
    dataChannel.onerror = (event) => {
      restore();
      previousError?.call(dataChannel, event);
      reject(new Error("Realtime data channel failed before opening."));
    };
    dataChannel.onclose = (event) => {
      restore();
      previousClose?.call(dataChannel, event);
      reject(new Error("Realtime data channel closed before opening."));
    };
  });
}
