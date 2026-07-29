export default function handler(request, response) {
  response.status(200).json({
    success: true,
    message: "MedLinks delivery API is working"
  });
}
