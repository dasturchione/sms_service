import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import Operator from '#models/operator'
import OperatorUssdCommand from '#models/operator_ussd_command'
import { UssdKind } from '#enums/ussd'

/**
 * Uzbek mobile operators and their self-service codes.
 *
 * USSD codes are seeded rather than hard-coded in the device build because
 * operators change them without notice; when that happens the fix is a row
 * update, not an APK rollout.
 *
 * The codes below are the ones commonly published by each operator. Verify
 * them against a live SIM before relying on the balance scheduler in M5.
 */
const OPERATORS = [
  {
    name: 'Ucell',
    code: 'ucell',
    mcc: '434',
    mnc: '05',
    phonePrefixes: ['93', '94'],
    ussd: {
      [UssdKind.BALANCE]: { command: '*100#', parserKey: 'ucell.balance' },
      [UssdKind.SMS_BALANCE]: { command: '*100*2#', parserKey: 'ucell.sms_balance' },
      [UssdKind.PHONE_NUMBER]: { command: '*100*1#', parserKey: 'generic.phone_number' },
    },
  },
  {
    name: 'Beeline',
    code: 'beeline',
    mcc: '434',
    mnc: '04',
    phonePrefixes: ['90', '91'],
    ussd: {
      [UssdKind.BALANCE]: { command: '*105#', parserKey: 'beeline.balance' },
      [UssdKind.SMS_BALANCE]: { command: '*102#', parserKey: 'beeline.sms_balance' },
      [UssdKind.PHONE_NUMBER]: { command: '*110*10#', parserKey: 'generic.phone_number' },
    },
  },
  {
    name: 'Mobiuz',
    code: 'mobiuz',
    mcc: '434',
    mnc: '07',
    phonePrefixes: ['88', '97'],
    ussd: {
      [UssdKind.BALANCE]: { command: '*100#', parserKey: 'mobiuz.balance' },
      [UssdKind.SMS_BALANCE]: { command: '*104#', parserKey: 'mobiuz.sms_balance' },
      [UssdKind.PHONE_NUMBER]: { command: '*102#', parserKey: 'generic.phone_number' },
    },
  },
  {
    name: 'Uzmobile',
    code: 'uzmobile',
    mcc: '434',
    mnc: '01',
    phonePrefixes: ['95', '99', '77'],
    ussd: {
      [UssdKind.BALANCE]: { command: '*100#', parserKey: 'uzmobile.balance' },
      [UssdKind.PHONE_NUMBER]: { command: '*101#', parserKey: 'generic.phone_number' },
    },
  },
  {
    name: 'Humans',
    code: 'humans',
    mcc: '434',
    mnc: '08',
    phonePrefixes: ['33'],
    ussd: {
      [UssdKind.BALANCE]: { command: '*100#', parserKey: 'humans.balance' },
    },
  },
] as const

export default class extends BaseSeeder {
  async run() {
    const now = DateTime.now()

    for (const definition of OPERATORS) {
      const operator = await Operator.updateOrCreate(
        { code: definition.code },
        {
          name: definition.name,
          code: definition.code,
          country: 'UZ',
          mcc: definition.mcc,
          mnc: definition.mnc,
          phonePrefixes: [...definition.phonePrefixes],
          isActive: true,
          createdAt: now,
        }
      )

      for (const [kind, config] of Object.entries(definition.ussd)) {
        await OperatorUssdCommand.updateOrCreate(
          { operatorId: operator.id, kind: kind as UssdKind },
          {
            operatorId: operator.id,
            kind: kind as UssdKind,
            command: config.command,
            steps: [],
            parserKey: config.parserKey,
            isActive: true,
            createdAt: now,
          }
        )
      }
    }
  }
}
