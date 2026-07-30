const SERVICEABILITY_URL =
  "https://staging-express.delhivery.com/c/api/pin-codes/json/";

const EXPECTED_TAT_URL =
  "https://staging-express.delhivery.com/api/dc/expected_tat";

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function formatDeliveryDate(date) {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

export default async function handler(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    return response.status(204).end();
  }

  if (request.method !== "GET") {
    return response.status(405).json({
      success: false,
      message: "Method not allowed",
    });
  }

  const destinationPincode = String(request.query.pincode || "").trim();
  const originPincode = process.env.ORIGIN_PINCODE;
  const apiToken = process.env.DELHIVERY_API_TOKEN;

  if (!/^[1-9][0-9]{5}$/.test(destinationPincode)) {
    return response.status(400).json({
      success: false,
      message: "Please enter a valid 6-digit PIN code.",
    });
  }

  if (!apiToken || !originPincode) {
    return response.status(500).json({
      success: false,
      message: "Server configuration is incomplete.",
    });
  }

  try {
    const serviceabilityResponse = await fetch(
      `${SERVICEABILITY_URL}?filter_codes=${encodeURIComponent(
        destinationPincode
      )}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: apiToken,
        },
      }
    );

    if (!serviceabilityResponse.ok) {
  const body = await serviceabilityResponse.text();

  throw new Error(
    `Serviceability API failed.
Status: ${serviceabilityResponse.status}
Body: ${body}`
  );
}

    const serviceabilityData = await serviceabilityResponse.json();
    const postalCode =
      serviceabilityData?.delivery_codes?.[0]?.postal_code || null;

    const deliveryAvailable =
      postalCode &&
      String(postalCode.pre_paid || "").toUpperCase() === "Y";

    if (!deliveryAvailable) {
      return response.status(200).json({
        success: true,
        serviceable: false,
        codAvailable: false,
        message: "Delivery is currently unavailable for this PIN code.",
      });
    }

    const tatUrl = new URL(EXPECTED_TAT_URL);
    tatUrl.searchParams.set("origin_pin", originPincode);
    tatUrl.searchParams.set("destination_pin", destinationPincode);
    tatUrl.searchParams.set("mot", "E");

    const tatResponse = await fetch(tatUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: apiToken,
      },
    });

    if (!tatResponse.ok) {
      throw new Error(
        `Expected TAT API failed with status ${tatResponse.status}`
      );
    }

    const tatData = await tatResponse.json();
    const tatDays = Number(tatData?.data?.tat);

    if (!tatData?.success || !Number.isFinite(tatDays)) {
      throw new Error("Delhivery did not return a valid TAT.");
    }

    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + tatDays);

    return response.status(200).json({
      success: true,
      serviceable: true,
      codAvailable:
        String(postalCode.cod || postalCode.cash || "").toUpperCase() === "Y",
      pincode: destinationPincode,
      originPincode,
      tatDays,
      transportMode: "Express",
      deliveryDateISO: deliveryDate.toISOString().slice(0, 10),
      deliveryDateFormatted: formatDeliveryDate(deliveryDate),
      message: `Delivery Available • Delivery by ${formatDeliveryDate(
        deliveryDate
      )}`,
    });
  } catch (error) {
    console.error("Delivery checker error:", error);

    return response.status(502).json({
      success: false,
      message:
        "We could not check delivery availability right now. Please try again.",
    });
  }
}
