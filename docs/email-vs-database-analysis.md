# Análisis: Datos del Email vs Base de Datos

## 📧 Columnas de la Tabla del Email

| # | Columna | Descripción | Cálculo/Origen |
|---|---------|-------------|----------------|
| 1 | **Ubicación** | Ciudad del opportunity | `opportunity.location.city` |
| 2 | **Precio Ref.** | Precio de referencia Rosario | `rosarioMatch.opportunity.paymentOptions[0].pricePerTon` |
| 3 | **Ajuste** | Ajuste sobre referencia | `paymentOption.referenceDiff` + tipo |
| 4 | **Precio** | Precio original (USD o ARS) | `paymentOption.pricePerTon` + conversión |
| 5 | **Distancia (km)** | Distancia en kilómetros | `match.route.distance / 1000` |
| 6 | **Precio Flete** | Costo transporte por tonelada | `match.transportationCost / quotation.quantityTons` |
| 7 | **Comisión** | Comisión por tonelada (1%) | `match.commission / quotation.quantityTons` |
| 8 | **Plazo de pago** | Días de plazo | `paymentOption.paymentTermDays` |
| 9 | **Precio final TN** | Precio neto por tonelada | `pricePerTon - transportCostPerTon - commissionPerTon` |
| 10 | **Dif. vs Rosario** | Diferencia en ARS vs Rosario | Cálculo complejo (ver abajo) |
| 11 | **Dif. % vs Rosario** | Diferencia porcentual vs Rosario | `((matchFinal - rosarioFinal) / rosarioFinal) * 100` |

---

## 💾 Campos Actuales en tabla `Match`

| Campo | Tipo | Descripción | ¿Se usa en email? |
|-------|------|-------------|-------------------|
| `id` | Int | ID único | ❌ No |
| `quotationId` | Int | FK a quotation | ❌ No (implícito) |
| `opportunityId` | Int | FK a opportunity | ✅ Sí (para traer location) |
| `matchScore` | Decimal | Score calculado | ❌ No |
| `createdAt` | DateTime | Timestamp | ❌ No |
| `paymentOptionId` | Int | FK a payment option | ✅ Sí (para traer precio y plazo) |
| `commission` | Decimal | Comisión total | ✅ Sí (÷ quantity) |
| `profitability` | Decimal | Rentabilidad | ❌ No (no se muestra) |
| `transportationCost` | Decimal | Costo transporte total | ✅ Sí (÷ quantity) |
| `profitabilityVsReference` | Decimal | ??? | ❌ No usado |
| `pricePerTon` | Decimal | Precio por tonelada | ✅ Sí |
| `totalAmount` | Decimal | Monto total | ❌ No |
| `transportCost` | Decimal | Duplicado de transportationCost | ❌ No |
| `routeId` | Int? | FK a Route | ✅ Sí (para traer distancia) |

---

## ❌ DATOS CALCULADOS QUE **NO** SE GUARDAN

### 1. **Tipo de Cambio Usado** 🔴 CRÍTICO
- **Dónde se calcula:** `matching.ts` línea 134, 466
- **Dónde se usa en email:** Múltiples lugares para conversión USD→ARS
- **Por qué es crítico:** Si el tipo de cambio cambia, no podemos reproducir el cálculo exacto
- **Campo propuesto:** `exchangeRateUsed` (Decimal 10,4)

### 2. **Distancia en KM** 🟡 MEDIO
- **Dónde se calcula:** `matching.ts` línea 154 (`metersToKm`)
- **Dónde se usa en email:** Columna "Distancia (km)" - línea 333
- **Actualmente:** Se calcula desde `route.distance` on-the-fly
- **Problema:** Si Route se borra, se pierde la distancia
- **Campo propuesto:** `distanceKm` (Int)

### 3. **Es Oferta Especial** 🟡 MEDIO
- **Dónde se calcula:** `matching.ts` línea 259 (`isSpecialOffer`)
- **Dónde se usa en email:** Badge "🔥 ESPECIAL", filtros, ordenamiento
- **Actualmente:** Se busca en `opportunity.isSpecialOffer` via JOIN
- **Problema:** Query más compleja, no se puede filtrar directo
- **Campo propuesto:** `isSpecialOffer` (Boolean)

### 4. **Precio Referencia Rosario** 🔴 CRÍTICO
- **Dónde se calcula:** `email.ts` línea 106-114 (`formatReferencePrice`)
- **Dónde se usa en email:** Columna "Precio Ref."
- **Actualmente:** Se busca el match de Rosario (id: -1) en memoria
- **Problema:** El match de Rosario NO se guarda en DB
- **Campo propuesto:** `rosarioPricePerTon` (Decimal 10,2)

### 5. **Diferencia vs Rosario (ARS)** 🔴 CRÍTICO
- **Dónde se calcula:** `email.ts` línea 151-191 (`calculateRosarioDifference`)
- **Fórmula:**
  ```
  matchFinalPrice = pricePerTonARS - (transportCost / qty) - (commission / qty)
  rosarioFinalPrice = rosarioPrice - (rosarioTransport / qty)
  difference = matchFinalPrice - rosarioFinalPrice
  ```
- **Dónde se usa en email:** Columna "Dif. vs Rosario"
- **Problema:** Cálculo complejo, recalcular cada vez es ineficiente
- **Campo propuesto:** `rosarioDifference` (Decimal 15,2)

### 6. **Diferencia % vs Rosario** 🔴 CRÍTICO
- **Dónde se calcula:** `email.ts` línea 194-241 (`calculateRosarioDifferencePercentage`)
- **Fórmula:** `((matchFinal - rosarioFinal) / rosarioFinal) * 100`
- **Dónde se usa en email:** Columna "Dif. % vs Rosario"
- **Problema:** Mismo que #5
- **Campo propuesto:** `rosarioDifferencePercent` (Decimal 5,2)

### 7. **Tarifa de Transporte Aplicada** 🟢 BAJO
- **Dónde se calcula:** `matching.ts` línea 160 (`getTransportRate`)
- **Dónde se usa en email:** NO se muestra directamente
- **Problema:** No podemos auditar qué tarifa se usó si cambian las tarifas
- **Campo propuesto:** `transportRateApplied` (Decimal 10,2)

### 8. **Días de Plazo de Pago** 🟡 MEDIO
- **Dónde viene:** `paymentOption.paymentTermDays`
- **Dónde se usa en email:** Columna "Plazo de pago" - línea 342
- **Actualmente:** Se accede via FK a PaymentOption
- **Problema:** JOIN adicional necesario
- **Campo propuesto:** `paymentTermDays` (Int)

### 9. **Tipo de Precio** 🟢 BAJO
- **Dónde viene:** `paymentOption.isReferenceBased`
- **Dónde se usa en email:** Badge "Ref" vs "Fijo"
- **Actualmente:** Se accede via FK a PaymentOption
- **Campo propuesto:** `isReferenceBased` (Boolean)

### 10. **Ajuste de Referencia** 🟢 BAJO
- **Dónde viene:** `paymentOption.referenceDiff` + `referenceDiffType`
- **Dónde se usa en email:** Columna "Ajuste"
- **Actualmente:** Se accede via FK a PaymentOption
- **Campo propuesto:** (opcional) `referenceDiffDisplay` (String)

---

## 📊 RESUMEN DE IMPACTO

### 🔴 **CRÍTICO (4 campos)**
Datos que **DEBEN** guardarse para reproducir el email exactamente:

1. **exchangeRateUsed** - Sin esto, conversiones USD incorrectas
2. **rosarioPricePerTon** - Precio de referencia usado
3. **rosarioDifference** - Diferencia en ARS vs Rosario
4. **rosarioDifferencePercent** - Diferencia % vs Rosario

### 🟡 **IMPORTANTE (3 campos)**
Datos que mejoran performance/queries pero son recuperables:

5. **distanceKm** - Recuperable desde Route, pero frágil
6. **isSpecialOffer** - Recuperable desde Opportunity, pero query compleja
7. **paymentTermDays** - Recuperable desde PaymentOption, JOIN adicional

### 🟢 **NICE TO HAVE (3 campos)**
Datos útiles para auditoría pero no esenciales:

8. **transportRateApplied** - Auditoría de tarifas
9. **isReferenceBased** - Tipo de precio
10. **referenceDiffDisplay** - Display del ajuste

---

## 🎯 RECOMENDACIÓN

### **Mínimo Viable (4 campos):**
```prisma
model Match {
  // ... campos existentes
  exchangeRateUsed         Decimal?  @map("exchange_rate_used") @db.Decimal(10, 4)
  rosarioPricePerTon       Decimal?  @map("rosario_price_per_ton") @db.Decimal(10, 2)
  rosarioDifference        Decimal?  @map("rosario_difference") @db.Decimal(15, 2)
  rosarioDifferencePercent Decimal?  @map("rosario_difference_percent") @db.Decimal(5, 2)
}
```

### **Recomendado (7 campos):**
Agregar también:
```prisma
  distanceKm               Int?      @map("distance_km")
  isSpecialOffer           Boolean   @default(false) @map("is_special_offer")
  paymentTermDays          Int?      @map("payment_term_days")
```

### **Completo (10 campos):**
Agregar todo para auditoría completa:
```prisma
  transportRateApplied     Decimal?  @map("transport_rate_applied") @db.Decimal(10, 2)
  isReferenceBased         Boolean   @default(false) @map("is_reference_based")
  referenceDiffDisplay     String?   @map("reference_diff_display") @db.VarChar(50)
```

---

## 🔄 CAMPOS QUE PODEMOS ELIMINAR

### **Candidatos para limpieza:**

1. **transportCost** - Duplicado exacto de `transportationCost` ❌
2. **profitabilityVsReference** - Nunca usado en email ❌
3. **totalAmount** - Fácilmente calculable: `pricePerTon * quantity` ❌

---

## 💡 BENEFICIOS DE GUARDAR TODO

### **Para el Frontend:**
✅ Query simple: `SELECT * FROM matches WHERE quotationId = X`
✅ No necesita calcular nada
✅ Renderiza tabla directamente desde DB
✅ No necesita JOIN complejos

### **Para Auditoría:**
✅ Reproducir email exacto en cualquier momento
✅ Saber qué tipo de cambio se usó
✅ Historial completo de cálculos
✅ Debug más fácil si hay problemas

### **Para Performance:**
✅ Menos cálculos on-the-fly
✅ Menos JOINs necesarios
✅ Cache friendly
✅ Queries más rápidas

---

## 📝 PRÓXIMOS PASOS

1. ✅ Decidir qué campos agregar (mínimo/recomendado/completo)
2. ⏳ Modificar schema de Prisma
3. ⏳ Crear migration
4. ⏳ Actualizar código de `saveMatchesToDatabase` para calcular y guardar
5. ⏳ (Opcional) Actualizar email para usar datos guardados en lugar de calcular
6. ⏳ (Opcional) Crear endpoint API para frontend que retorne matches completos
