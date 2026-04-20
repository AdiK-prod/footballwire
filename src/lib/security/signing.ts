import { createHmac, timingSafeEqual } from "node:crypto";

const normalize = (value: string): string => value.trim();

const encode = (value: string): string =>
  createHmac("sha256", value).update(value).digest("hex");

const digest = (secret: string, payload: string): string =>
  createHmac("sha256", normalize(secret)).update(payload).digest("hex");

export const signPayload = (secret: string, payload: string): string =>
  digest(secret, payload);

export const verifySignature = (
  secret: string,
  payload: string,
  signature: string,
): boolean => {
  if (!secret || !signature) {
    return false;
  }
  const expected = digest(secret, payload);
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
};

export const newsletterSubscriberPayload = (
  newsletterId: number,
  subscriberId: number,
): string => `${newsletterId}:${subscriberId}`;

export const subscriberPayload = (subscriberId: number): string =>
  `${subscriberId}`;

export const stableToken = (value: string): string => encode(value);
