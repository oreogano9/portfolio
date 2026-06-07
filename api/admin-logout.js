export const config = {
  runtime: "nodejs",
};

export default async function handler(request, response) {
  if (request.method !== "POST" && request.method !== "GET") {
    response.setHeader("Allow", "GET, POST");
    return response.status(405).json({ error: "Method not allowed" });
  }
  response.setHeader("Set-Cookie", "kp_admin_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure");
  response.writeHead(303, { Location: "/admin-login.html" });
  response.end();
}
