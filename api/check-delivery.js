const DELHIVERY_SERVICEABILITY_URL =
  "https://track.delhivery.com/c/api/pin-codes/json/";
const DELHIVERY_TAT_URL =
  "https://track.delhivery.com/api/dc/expected_tat";
const SHADOWFAX_PRODUCTION_URL = "https://dale.shadowfax.in/api";
const DEFAULT_ORIGIN_PINCODE = "110029";
const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

const responseCache = new Map();

function normalizeToken(token) {
  return String(token || "").replace(/^Token\s+/i, "").trim();
}

function tokenHeader(token) {
  const normalized = normalizeToken(token);
  return normalized ? `Token ${normalized}` : "";
}

function allowedOrigins() {
  return String(
    process.env.ALLOWED_ORIGINS ||
      "https://shopmedlinks.com,https://www.shopmedlinks.com"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function setCorsHeaders(request, response) {
  const requestOrigin = String(request.headers?.origin || "");
  const origins = allowedOrigins();
  const isShopifyStore = /^https:\/\/[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(
    requestOrigin
  );
  const permittedOrigin =
    origins.includes(requestOrigin) || isShopifyStore
      ? requestOrigin
      : origins[0];

  if (permittedOrigin) {
    response.setHeader("Access-Control-Allow-Origin", permittedOrigin);
  }
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader(
    "Cache-Control",
    "public, s-maxage=600, stale-while-revalidate=1800"
  );
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const apiResponse = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.headers || {}),
      },
    });
    const text = await apiResponse.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!apiResponse.ok) {
      const error = new Error(`Courier API returned ${apiResponse.status}.`);
      error.status = apiResponse.status;
      error.payload = data;
      throw error;
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function checkShadowfax(pincode, apiToken) {
  if (!apiToken) {
    return { attempted: false, available: false, services: [] };
  }

  const baseUrl = String(
    process.env.SHADOWFAX_API_BASE_URL || SHADOWFAX_PRODUCTION_URL
  ).replace(/\/$/, "");
  const url = new URL(`${baseUrl}/v1/clients/serviceability/`);
  url.searchParams.set("service", "customer_delivery");
  url.searchParams.set("page", "1");
  url.searchParams.set("count", "10");
  url.searchParams.set("pincodes", pincode);

  try {
    const data = await fetchJson(url, {
      method: "GET",
      headers: { Authorization: tokenHeader(apiToken) },
    });
    const records = Array.isArray(data) ? data : [];
    const record = records.find(
      (item) => String(item?.code || "") === String(pincode)
    );

    return {
      attempted: true,
      available: Boolean(record),
      services: Array.isArray(record?.services) ? record.services : [],
    };
  } catch (error) {
    return {
      attempted: true,
      available: false,
      services: [],
      error: error.message,
    };
  }
}

function extractTatDays(data) {
  const candidates = [
    data?.data?.tat,
    data?.data?.expected_tat,
    data?.tat,
    data?.expected_tat,
  ];

  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }

  return null;
}

async function checkDelhivery(pincode, originPincode, apiToken) {
  if (!apiToken) {
    return {
      attempted: false,
      available: false,
      codAvailable: null,
      tatDays: null,
    };
  }

  const authorization = tokenHeader(apiToken);

  try {
    const serviceUrl = new URL(DELHIVERY_SERVICEABILITY_URL);
    serviceUrl.searchParams.set("filter_codes", pincode);
    const serviceData = await fetchJson(serviceUrl, {
      method: "GET",
      headers: { Authorization: authorization },
    });
    const postalCode = serviceData?.delivery_codes?.[0]?.postal_code || null;
    const prepaid = String(postalCode?.pre_paid || "").toUpperCase() === "Y";
    const cod =
      String(postalCode?.cod || postalCode?.cash || "").toUpperCase() === "Y";
    const available = Boolean(postalCode && (prepaid || cod));

    if (!available) {
      return {
        attempted: true,
        available: false,
        codAvailable: false,
        tatDays: null,
      };
    }

    const tatUrl = new URL(DELHIVERY_TAT_URL);
    tatUrl.searchParams.set("origin_pin", originPincode);
    tatUrl.searchParams.set("destination_pin", pincode);
    tatUrl.searchParams.set("mot", "E");

    let tatDays = null;
    let tatError = null;
    try {
      const tatData = await fetchJson(tatUrl, {
        method: "GET",
        headers: { Authorization: authorization },
      });
      tatDays = extractTatDays(tatData);
      if (tatDays === null) tatError = "No valid delivery TAT was returned.";
    } catch (error) {
      tatError = error.message;
    }

    return {
      attempted: true,
      available: true,
      codAvailable: cod,
      tatDays,
      tatError,
    };
  } catch (error) {
    return {
      attempted: true,
      available: false,
      codAvailable: null,
      tatDays: null,
      error: error.message,
    };
  }
}

function getIstParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function holidayDates() {
  return new Set(
    String(process.env.HOLIDAY_DATES || "")
      .split(",")
      .map((date) => date.trim())
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
  );
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function isOperatingDay(date, holidays) {
  return date.getUTCDay() !== 0 && !holidays.has(isoDate(date));
}

function calculateDeliveryDate(tatDays, now = new Date()) {
  const ist = getIstParts(now);
  const date = new Date(Date.UTC(ist.year, ist.month - 1, ist.day));
  const cutoffHour = Number(process.env.CUTOFF_HOUR_IST || 12);
  const afterCutoff = ist.hour >= cutoffHour;
  let remaining = Math.max(0, Math.ceil(Number(tatDays))) + (afterCutoff ? 1 : 0);
  const holidays = holidayDates();

  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (isOperatingDay(date, holidays)) remaining -= 1;
  }

  while (!isOperatingDay(date, holidays)) {
    date.setUTCDate(date.getUTCDate() + 1);
  }

  return date;
}

function formatDeliveryDate(date) {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
}

function cachedResult(pincode) {
  const cached = responseCache.get(pincode);
  if (!cached || Date.now() - cached.createdAt > CACHE_TTL_MS) {
    responseCache.delete(pincode);
    return null;
  }
  return cached.payload;
}

function storeResult(pincode, payload) {
  responseCache.set(pincode, { createdAt: Date.now(), payload });
}

export default async function handler(request, response) {
  setCorsHeaders(request, response);

  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "GET") {
    return response.status(405).json({
      success: false,
      message: "Method not allowed.",
    });
  }

  const destinationPincode = String(request.query.pincode || "").trim();
  const originPincode = String(
    process.env.ORIGIN_PINCODE || DEFAULT_ORIGIN_PINCODE
  ).trim();

  if (!/^[1-9][0-9]{5}$/.test(destinationPincode)) {
    return response.status(400).json({
      success: false,
      message: "Please enter a valid 6-digit PIN code.",
    });
  }

  const cached = cachedResult(destinationPincode);
  if (cached) return response.status(200).json(cached);

  const delhiveryToken = process.env.DELHIVERY_API_TOKEN;
  const shadowfaxToken = process.env.SHADOWFAX_API_TOKEN;

  if (!delhiveryToken && !shadowfaxToken) {
    return response.status(500).json({
      success: false,
      message: "Delivery services are not configured.",
    });
  }

  const [shadowfax, delhivery] = await Promise.all([
    checkShadowfax(destinationPincode, shadowfaxToken),
    checkDelhivery(destinationPincode, originPincode, delhiveryToken),
  ]);

  const serviceable = shadowfax.available || delhivery.available;
  const anyCheckFailed = [shadowfax, delhivery].some(
    (carrier) => carrier.attempted && Boolean(carrier.error)
  );

  if (!serviceable && anyCheckFailed) {
    console.error("All delivery checks failed", {
      shadowfax: shadowfax.error,
      delhivery: delhivery.error,
    });
    return response.status(502).json({
      success: false,
      message: "Unable to check live delivery availability right now.",
      fallbackAllowed: true,
    });
  }

  if (!serviceable) {
    const payload = {
      success: true,
      serviceable: false,
      codAvailable: false,
      pincode: destinationPincode,
      message: "Delivery is currently unavailable for this PIN code.",
    };
    storeResult(destinationPincode, payload);
    return response.status(200).json(payload);
  }

  const deliveryDate =
    delhivery.tatDays !== null
      ? calculateDeliveryDate(delhivery.tatDays)
      : null;
  const primaryCarrier = shadowfax.available ? "Shadowfax" : "Delhivery";
  const payload = {
    success: true,
    serviceable: true,
    codAvailable: delhivery.available ? delhivery.codAvailable : null,
    pincode: destinationPincode,
    originPincode,
    primaryCarrier,
    availableServices: shadowfax.available ? shadowfax.services : ["Express"],
    tatDays: delhivery.tatDays,
    deliveryDateISO: deliveryDate ? isoDate(deliveryDate) : null,
    deliveryDateFormatted: deliveryDate
      ? formatDeliveryDate(deliveryDate)
      : null,
    useLocalEstimate: !deliveryDate,
    message: deliveryDate
      ? `Delivery Available • Delivery by ${formatDeliveryDate(deliveryDate)}`
      : "Delivery Available",
  };

  storeResult(destinationPincode, payload);
  return response.status(200).json(payload);
}

export const testable = {
  calculateDeliveryDate,
  extractTatDays,
  normalizeToken,
  tokenHeader,
};
