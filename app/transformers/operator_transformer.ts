import type Operator from '#models/operator'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class OperatorTransformer extends BaseTransformer<Operator> {
  toObject() {
    const operator = this.resource

    return {
      code: operator.code,
      name: operator.name,
      country: operator.country,

      /**
       * The network identity a device reports. Kept so a SIM can be matched to
       * its operator without trusting the label a person typed.
       */
      mcc: operator.mcc,
      mnc: operator.mnc,

      phonePrefixes: operator.phonePrefixes,
      isActive: operator.isActive,
      createdAt: operator.createdAt,
      updatedAt: operator.updatedAt,
    }
  }
}
