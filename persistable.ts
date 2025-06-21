// persisted.decorator.ts
import { DurableObjectState } from "@cloudflare/workers-types";

const DURABLE_OBJECT_STATE = Symbol("durableObjectState");
const ORIGINAL_PROPERTIES = Symbol("originalProperties");

interface PersistableOptions {
  exclude?: string[];
  include?: string[];
  prefix?: string;
}

export function Persistable(options: PersistableOptions = {}) {
  return function <T extends new (...args: any[]) => any>(constructor: T) {
    return class extends constructor {
      private [ORIGINAL_PROPERTIES] = new Map<string, any>();

      constructor(...args: any[]) {
        super(...args);

        // Store reference to DurableObjectState
        if (args[0] && typeof args[0] === "object" && "storage" in args[0]) {
          this[DURABLE_OBJECT_STATE] = args[0];
          this.initializeStorage();
          this.setupPropertyPersistence();
        }
      }

      private initializeStorage() {
        const state: DurableObjectState = this[DURABLE_OBJECT_STATE];
        if (state?.storage?.sql) {
          try {
            state.storage.sql.exec(`
              CREATE TABLE IF NOT EXISTS _persisted_kv (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
              )
            `);
          } catch (error) {
            console.error("Failed to initialize persistence storage:", error);
          }
        }
      }

      private setupPropertyPersistence() {
        const { exclude = [], include, prefix = "" } = options;

        // Get all property names from the instance
        const propertyNames = this.getSerializableProperties();

        for (const propertyName of propertyNames) {
          // Skip if excluded
          if (exclude.includes(propertyName)) continue;

          // If include list exists, only process properties in the list
          if (include && !include.includes(propertyName)) continue;

          // Skip functions and getters/setters
          if (typeof this[propertyName] === "function") continue;

          this.makePropertyPersistent(propertyName, prefix);
        }
      }

      private getSerializableProperties(): string[] {
        const properties = new Set<string>();

        // Get all own properties
        Object.getOwnPropertyNames(this).forEach((prop) => {
          if (!prop.startsWith("_") && prop !== "constructor") {
            properties.add(prop);
          }
        });

        // Get properties from prototype chain (up to the decorated class)
        let proto = Object.getPrototypeOf(this);
        while (proto && proto.constructor !== Object) {
          Object.getOwnPropertyNames(proto).forEach((prop) => {
            if (
              !prop.startsWith("_") &&
              prop !== "constructor" &&
              typeof proto[prop] !== "function"
            ) {
              properties.add(prop);
            }
          });
          proto = Object.getPrototypeOf(proto);
          // Stop at the original constructor to avoid going too far up
          if (proto.constructor === constructor) break;
        }

        return Array.from(properties);
      }

      private makePropertyPersistent(propertyName: string, prefix: string) {
        const storageKey = prefix + propertyName;

        // Store original value
        this[ORIGINAL_PROPERTIES].set(propertyName, this[propertyName]);

        let value = this[propertyName];
        let initialized = false;

        Object.defineProperty(this, propertyName, {
          get: () => {
            if (!initialized) {
              // Load from SQL storage on first access
              const state: DurableObjectState = this[DURABLE_OBJECT_STATE];
              if (state?.storage?.sql) {
                try {
                  const result = state.storage.sql
                    .exec(
                      "SELECT value FROM _persisted_kv WHERE key = ?",
                      storageKey,
                    )
                    .toArray()[0];

                  if (result) {
                    value = JSON.parse(result.value as string);
                  } else {
                    // Use original/default value if nothing in storage
                    value = this[ORIGINAL_PROPERTIES].get(propertyName);
                  }
                } catch (error) {
                  console.warn(
                    `Failed to load persisted property ${propertyName}:`,
                    error,
                  );
                  value = this[ORIGINAL_PROPERTIES].get(propertyName);
                }
              }
              initialized = true;
            }
            return value;
          },

          set: (newValue: any) => {
            // Only persist if the value is serializable
            if (this.isSerializable(newValue)) {
              value = newValue;

              const state: DurableObjectState = this[DURABLE_OBJECT_STATE];
              if (state?.storage?.sql) {
                try {
                  state.storage.sql.exec(
                    `
                      INSERT OR REPLACE INTO _persisted_kv (key, value, updated_at) 
                      VALUES (?, ?, CURRENT_TIMESTAMP)
                    `,
                    storageKey,
                    JSON.stringify(newValue),
                  );
                } catch (error) {
                  console.error(
                    `Failed to persist property ${propertyName}:`,
                    error,
                  );
                }
              }
            } else {
              console.warn(
                `Property ${propertyName} is not serializable and won't be persisted`,
              );
              value = newValue;
            }
          },

          enumerable: true,
          configurable: true,
        });
      }

      private isSerializable(value: any): boolean {
        if (
          value === null ||
          value === undefined ||
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          return true;
        }

        if (Array.isArray(value)) {
          return value.every((item) => this.isSerializable(item));
        }

        if (typeof value === "object" && value.constructor === Object) {
          return Object.values(value).every((val) => this.isSerializable(val));
        }

        // Handle Date objects
        if (value instanceof Date) {
          return true;
        }

        // Handle objects with toJSON method
        if (typeof value.toJSON === "function") {
          return true;
        }

        return false;
      }
    };
  };
}
