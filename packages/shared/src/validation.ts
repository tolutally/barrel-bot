import { z } from "zod";

export const nonEmptyTextSchema = z.string().trim().min(1);
export const currencyCodeSchema = z.string().trim().regex(/^[A-Za-z]{3,5}$/).transform((value) => value.toUpperCase());
export const positiveMinorAmountSchema = z.bigint().positive();
