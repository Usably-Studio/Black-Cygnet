import {Hono} from "hono";
import {basicAuth} from "hono/basic-auth";
import {Context} from "hono";

const app = new Hono();

// Define allowedOrigins at the global scope
const getAllowedOrigins = (env) =>
  [
    "https://black-cygnet.webflow.io",
    "https://blackcynet.co.za",
    env?.STAGING_DOMAIN,
    env?.PROD_DOMAIN,
  ].filter(Boolean);

// Middleware to handle CORS
app.use("*", async (c, next) => {
  // Make sure c.req exists before trying to access headers
  if (!c || !c.req) {
    console.error("Context or request object is undefined");
    return c.text("Server Error", 500);
  }

  const origin = c.req.header("origin");
  const allowedOrigins = getAllowedOrigins(c.env);

  if (origin && allowedOrigins.includes(origin)) {
    c.header("Access-Control-Allow-Origin", origin);
  }

  c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (c.req.method === "OPTIONS") {
    return c.text("", 204);
  }

  await next();
});

// Basic authentication middleware
app.use("/api/*", async (c, next) => {
  // Make sure environment variables exist
  if (!c.env?.API_USERNAME || !c.env?.API_PASSWORD) {
    console.error("API credentials not properly configured");
    return c.json({error: "Server configuration error"}, 500);
  }

  return basicAuth({
    username: c.env.API_USERNAME,
    password: c.env.API_PASSWORD,
  })(c, next);
});

app.post("/api/lead", async (c) => {
  if (!c || !c.req) {
    return c.json({error: "Invalid request"}, 400);
  }

  const origin = c.req.header("origin");
  const allowedOrigins = getAllowedOrigins(c.env);

  if (!origin || !allowedOrigins.includes(origin)) {
    return c.json({error: "Unauthorized domain"}, 403);
  }

  try {
    const body = await c.req.json();

    // Add your logic to generate a token and make a request to the ConnexOne API
    const token = await getToken(c);

    if (!token) {
      return c.json({error: "Failed to authenticate with external API"}, 500);
    }

    const response = await fetch(
      "https://apigateway-shackletonlife-cxm.africa.connexone.cloud/contact",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    const responseData = await response.json();
    return c.json(responseData);
  } catch (error) {
    console.error("Error processing lead:", error);
    return c.json({error: "Failed to process request"}, 500);
  }
});

// Add a GET endpoint for testing
app.get("/api/lead", (c) => {
  return c.json({message: "API is working"});
});

async function getToken(c): Promise<string | null> {
  try {
    if (!c.env?.CLIENT_ID || !c.env?.CLIENT_SECRET) {
      console.error("OAuth credentials not properly configured");
      return null;
    }

    const response = await fetch(
      "https://apigateway-shackletonlife-cxm.africa.connexone.cloud/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: c.env.CLIENT_ID,
          client_secret: c.env.CLIENT_SECRET,
        }),
      }
    );

    if (!response.ok) {
      console.error("Failed to get token, status:", response.status);
      return null;
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error("Error getting token:", error);
    return null;
  }
}

export default app;
