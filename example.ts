import { DurableObject } from "cloudflare:workers";
import { Persisted } from "./persisted";

@Persisted()
export class MyDurableObject extends DurableObject {
  public counter: number = 0;
  public userData: { name: string; email: string } | null = null;
  public settings: Record<string, any> = {};
  public items: string[] = [];
  // Not serialised, doesn't seem to work
  // public lastUpdated: Date = new Date();

  // This won't be persisted (not serializable)
  public tempCallback: () => void = () => {};

  // This won't be persisted (starts with _)
  private _internalState: any = {};

  async increment() {
    this.counter++; // Automatically persisted
    // this.lastUpdated = new Date(); // Also persisted
    return this.counter;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST") {
      try {
        const formData = await request.formData();

        // Handle counter (number)
        const counterValue = formData.get("counter");
        if (counterValue) {
          this.counter = parseInt(counterValue.toString(), 10) || 0;
        }

        // Handle user name (string)
        const userName = formData.get("userName");
        if (userName) {
          this.userData = {
            name: userName.toString(),
            email: this.userData?.email || "",
          };
        }

        // Handle user email (string)
        const userEmail = formData.get("userEmail");
        if (userEmail) {
          this.userData = {
            name: this.userData?.name || "",
            email: userEmail.toString(),
          };
        }

        // Handle items (string[])
        const itemsValue = formData.get("items");
        if (itemsValue) {
          // Split by comma and trim each item
          this.items = itemsValue
            .toString()
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item.length > 0);
        }

        // Update timestamp
        // this.lastUpdated = new Date();

        // Redirect to prevent form resubmission
        return new Response(null, {
          status: 302,
          headers: { Location: url.pathname },
        });
      } catch (error) {
        return new Response(`Error processing form: ${error}`, { status: 400 });
      }
    }

    // GET request - show the form
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Durable Object Persistence Demo</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            border-bottom: 2px solid #007acc;
            padding-bottom: 10px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
            color: #555;
        }
        input, textarea {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            box-sizing: border-box;
        }
        button {
            background-color: #007acc;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            margin: 10px 5px 10px 0;
        }
        button:hover {
            background-color: #005a9e;
        }
        .increment-btn {
            background-color: #28a745;
        }
        .increment-btn:hover {
            background-color: #218838;
        }
        .current-values {
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 4px;
            margin-bottom: 20px;
            border: 1px solid #e9ecef;
        }
        .value-item {
            margin-bottom: 10px;
        }
        .value-label {
            font-weight: bold;
            color: #495057;
        }
        .value-content {
            color: #6c757d;
            font-family: monospace;
            background-color: #fff;
            padding: 5px 8px;
            border-radius: 3px;
            border: 1px solid #dee2e6;
            margin-top: 3px;
        }
        .help-text {
            font-size: 12px;
            color: #6c757d;
            margin-top: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔄 Durable Object Persistence Demo</h1>
        
        <div class="current-values">
            <h3>Current Persisted Values:</h3>
            <div class="value-item">
                <div class="value-label">Counter (number):</div>
                <div class="value-content">${this.counter}</div>
            </div>
            <div class="value-item">
                <div class="value-label">User Data (object):</div>
                <div class="value-content">${JSON.stringify(
                  this.userData,
                  null,
                  2,
                )}</div>
            </div>
            <div class="value-item">
                <div class="value-label">Items (string[]):</div>
                <div class="value-content">[${this.items
                  .map((item) => `"${item}"`)
                  .join(", ")}]</div>
            </div>
           <!-- <div class="value-item">
                <div class="value-label">Last Updated:</div>
                <div class="value-content">\${this.lastUpdated?.toISOString()}</div>
            </div>-->
        </div>

        <form method="POST">
            <div class="form-group">
                <label for="counter">Counter (Number):</label>
                <input 
                    type="number" 
                    id="counter" 
                    name="counter" 
                    value="${this.counter}"
                    min="0"
                >
                <div class="help-text">Set the counter value directly</div>
            </div>

            <div class="form-group">
                <label for="userName">User Name (String):</label>
                <input 
                    type="text" 
                    id="userName" 
                    name="userName" 
                    value="${this.userData?.name || ""}"
                    placeholder="Enter user name"
                >
            </div>

            <div class="form-group">
                <label for="userEmail">User Email (String):</label>
                <input 
                    type="email" 
                    id="userEmail" 
                    name="userEmail" 
                    value="${this.userData?.email || ""}"
                    placeholder="Enter user email"
                >
            </div>

            <div class="form-group">
                <label for="items">Items (String Array):</label>
                <textarea 
                    id="items" 
                    name="items" 
                    rows="3"
                    placeholder="Enter items separated by commas (e.g., apple, banana, cherry)"
                >${this.items.join(", ")}</textarea>
                <div class="help-text">Separate items with commas</div>
            </div>

            <button type="submit">💾 Update Values</button>
        </form>

        <form method="POST" style="display: inline;">
            <input type="hidden" name="counter" value="${this.counter + 1}">
            <button type="submit" class="increment-btn">➕ Increment Counter</button>
        </form>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
            <p><strong>How it works:</strong></p>
            <ul>
                <li>All form changes are automatically persisted using the <code>@Persisted()</code> decorator</li>
                <li>Values survive Durable Object restarts and cold starts</li>
                <li>Data is stored in SQL storage within the Durable Object</li>
                <li>Refresh the page to see that values persist!</li>
            </ul>
        </div>
    </div>
</body>
</html>
    `;

    return new Response(html, {
      headers: { "Content-Type": "text/html" },
    });
  }
}

// Export default fetch handler that routes to the Durable Object
export default {
  async fetch(request: Request, env: any): Promise<Response> {
    // Get the Durable Object namespace
    const durableObjectNamespace = env.MY_DURABLE_OBJECT;

    if (!durableObjectNamespace) {
      return new Response("Durable Object namespace not found", {
        status: 500,
      });
    }

    // Create a stable ID for the Durable Object (you could also use URL params)
    const id = durableObjectNamespace.idFromName("demo-object");

    // Get the Durable Object instance
    const durableObject = durableObjectNamespace.get(id);

    // Forward the request to the Durable Object
    return durableObject.fetch(request);
  },
} satisfies ExportedHandler<{ MY_DURABLE_OBJECT: DurableObjectNamespace }>;
