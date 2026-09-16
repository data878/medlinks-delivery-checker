export default function handler(_request, response) {
  response.status(200).json({
    success: true,
    message: "MedLinks delivery API is working",
    configuration: {
      originPincode: process.env.ORIGIN_PINCODE || "110029",
      delhiveryConfigured: Boolean(process.env.DELHIVERY_API_TOKEN),
      shadowfaxConfigured: Boolean(process.env.SHADOWFAX_API_TOKEN),
      cutoffHourIST: Number(process.env.CUTOFF_HOUR_IST || 12),
    },
  });
}
