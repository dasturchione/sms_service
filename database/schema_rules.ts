import { type SchemaRules } from '@adonisjs/lucid/types/schema_generator'

/**
 * Rules that shape `database/schema.ts`, which is regenerated after every
 * migration run.
 *
 * Two things are fixed here that the generator cannot infer from Postgres:
 *
 * 1. Status columns are plain `varchar`, so without a rule they would be typed
 *    as `string` and every comparison against an enum member would silently
 *    type-check.
 * 2. `jsonb` columns default to `any`. Giving them concrete shapes is what
 *    makes settings, abilities and payloads safe to read.
 *
 * Note on writes: node-postgres turns a JS array into a Postgres array
 * literal, which jsonb rejects. Array backed json columns therefore
 * re-declare `prepare` in their model. Object backed ones are fine as is.
 *
 * `tsType` must not include `| null`; the generator appends it for nullable
 * columns on its own.
 */

const enumType = (tsType: string, source: string, name: string) => ({
  tsType,
  imports: [{ source, typeImports: [name] }],
})

const jsonType = (tsType: string, imports: { source: string; typeImports: string[] }[] = []) => ({
  tsType,
  imports,
})

const jsonObject = jsonType('Record<string, unknown>')

export default {
  tables: {
    tenants: {
      columns: {
        status: enumType('TenantStatus', '#enums/tenant', 'TenantStatus'),
        settings: jsonType('TenantSettings', [
          { source: '#enums/tenant', typeImports: ['TenantSettings'] },
        ]),
      },
    },

    users: {
      columns: {
        role: enumType('UserRole', '#enums/tenant', 'UserRole'),
      },
    },

    api_clients: {
      columns: {
        abilities: jsonType('ClientAbility[]', [
          { source: '#enums/ability', typeImports: ['ClientAbility'] },
        ]),
      },
    },

    operators: {
      columns: {
        phone_prefixes: jsonType('string[]'),
      },
    },

    gateways: {
      columns: {
        status: enumType('GatewayStatus', '#enums/gateway_status', 'GatewayStatus'),
      },
    },

    sim_profiles: {
      columns: {
        state: enumType('SimState', '#enums/gateway_status', 'SimState'),
      },
    },

    sms_messages: {
      columns: {
        status: enumType('SmsStatus', '#enums/sms_status', 'SmsStatus'),
        error_code: enumType('ErrorCode', '#enums/error_code', 'ErrorCode'),
      },
    },

    sms_events: {
      columns: {
        event: enumType('SmsEvent', '#enums/sms_event', 'SmsEvent'),
        payload: jsonObject,
      },
    },

    sms_attempts: {
      columns: {
        status: enumType('SmsAttemptStatus', '#enums/sms_status', 'SmsAttemptStatus'),
        error_code: enumType('ErrorCode', '#enums/error_code', 'ErrorCode'),
      },
    },

    audit_logs: {
      columns: {
        actor_type: enumType('ActorType', '#enums/audit_action', 'ActorType'),
        action: enumType('AuditAction', '#enums/audit_action', 'AuditAction'),
        metadata: jsonObject,
      },
    },

    webhook_endpoints: {
      columns: {
        events: jsonType('string[]'),
      },
    },

    operator_ussd_commands: {
      columns: {
        kind: enumType('UssdKind', '#enums/ussd', 'UssdKind'),
        steps: jsonType('string[]'),
      },
    },

    ussd_requests: {
      columns: {
        kind: enumType('UssdKind', '#enums/ussd', 'UssdKind'),
        status: enumType('UssdStatus', '#enums/ussd', 'UssdStatus'),
        steps: jsonType('string[]'),
        parsed: jsonObject,
        error_code: enumType('ErrorCode', '#enums/error_code', 'ErrorCode'),
      },
    },

    gateway_events: {
      columns: {
        payload: jsonObject,
      },
    },
  },
} satisfies SchemaRules
