-- Integrity rules that Prisma's schema language cannot express.
-- They are what makes double-booking and inconsistent money/state impossible at the DATABASE level,
-- independent of any application bug.

-- 1) A seat row can only be in a self-consistent state.
--    AVAILABLE/BLOCKED: nobody owns it. HELD: owned + has an expiry. SOLD: owned.
ALTER TABLE "ConcertSeat" ADD CONSTRAINT "ConcertSeat_state_consistency_chk" CHECK (
     ("status" = 'AVAILABLE' AND "reservationId" IS NULL AND "heldUntil" IS NULL)
  OR ("status" = 'HELD'      AND "reservationId" IS NOT NULL AND "heldUntil" IS NOT NULL)
  OR ("status" = 'SOLD'      AND "reservationId" IS NOT NULL)
  OR ("status" = 'BLOCKED'   AND "reservationId" IS NULL)
);

-- 2) Money is never negative / zero where it must not be.
ALTER TABLE "PriceTier"       ADD CONSTRAINT "PriceTier_amount_chk"       CHECK ("amount" > 0);
ALTER TABLE "ReservationItem" ADD CONSTRAINT "ReservationItem_price_chk"  CHECK ("price" > 0);
ALTER TABLE "Reservation"     ADD CONSTRAINT "Reservation_total_chk"      CHECK ("totalAmount" >= 0);
ALTER TABLE "Payment"         ADD CONSTRAINT "Payment_amount_chk"         CHECK ("amount" > 0);

-- 3) Reservation lifecycle columns must agree with status.
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_lifecycle_chk" CHECK (
     ("status" <> 'CONFIRMED' OR "confirmedAt" IS NOT NULL)
 AND ("status" <> 'CANCELLED' OR "cancelledAt" IS NOT NULL)
);

-- 4) A reservation can be paid for at most once.
CREATE UNIQUE INDEX "Payment_reservationId_succeeded_key" ON "Payment"("reservationId") WHERE "status" = 'SUCCEEDED';

-- 5) A seat can have at most one live (non-cancelled) ticket per concert.
CREATE UNIQUE INDEX "Ticket_concertSeatId_active_key" ON "Ticket"("concertSeatId") WHERE "status" <> 'CANCELLED';

-- 6) Data hygiene.
ALTER TABLE "User"      ADD CONSTRAINT "User_mobile_format_chk" CHECK ("mobile" ~ '^09[0-9]{9}$');
ALTER TABLE "User"      ADD CONSTRAINT "User_email_lower_chk"   CHECK ("email" IS NULL OR "email" = lower("email"));
ALTER TABLE "Concert"   ADD CONSTRAINT "Concert_duration_chk"   CHECK ("durationMinutes" > 0);
ALTER TABLE "Concert"   ADD CONSTRAINT "Concert_maxseats_chk"   CHECK ("maxSeatsPerReservation" BETWEEN 1 AND 20);
ALTER TABLE "Seat"      ADD CONSTRAINT "Seat_number_chk"        CHECK ("number" > 0);
