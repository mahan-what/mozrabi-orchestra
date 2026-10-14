-- Initial schema. This file mirrors prisma/schema.prisma using the naming
-- conventions of `prisma migrate` (Table_pkey, Table_col_key, Table_col_idx, Table_col_fkey).
-- NOTE: it was transcribed by hand because the Prisma schema engine could not be
-- downloaded in the authoring sandbox. Run `npx prisma migrate diff` (see README) to confirm
-- there is no drift on your machine.

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "ConcertStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');
CREATE TYPE "SeatStatus" AS ENUM ('AVAILABLE', 'HELD', 'SOLD', 'BLOCKED');
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUND_REQUIRED', 'REFUNDED');
CREATE TYPE "TicketStatus" AS ENUM ('VALID', 'USED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seat" (
    "id" SERIAL NOT NULL,
    "venueId" INTEGER NOT NULL,
    "rowLabel" TEXT NOT NULL,
    "rowOrder" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,

    CONSTRAINT "Seat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Concert" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "program" JSONB NOT NULL DEFAULT '[]',
    "venueId" INTEGER NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "status" "ConcertStatus" NOT NULL DEFAULT 'DRAFT',
    "maxSeatsPerReservation" INTEGER NOT NULL DEFAULT 6,
    "coverImageUrl" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Concert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceTier" (
    "id" SERIAL NOT NULL,
    "concertId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "rows" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PriceTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConcertSeat" (
    "id" SERIAL NOT NULL,
    "concertId" INTEGER NOT NULL,
    "seatId" INTEGER NOT NULL,
    "tierId" INTEGER NOT NULL,
    "status" "SeatStatus" NOT NULL DEFAULT 'AVAILABLE',
    "reservationId" UUID,
    "heldUntil" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ConcertSeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "concertId" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "totalAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRT',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "contactName" TEXT,
    "contactMobile" TEXT,
    "contactEmail" TEXT,
    "idempotencyKey" TEXT,
    "confirmedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationItem" (
    "id" SERIAL NOT NULL,
    "reservationId" UUID NOT NULL,
    "concertSeatId" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,

    CONSTRAINT "ReservationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "reservationId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRT',
    "authority" TEXT,
    "trackingCode" TEXT,
    "failureReason" TEXT,
    "initiatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" SERIAL NOT NULL,
    "paymentId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" UUID NOT NULL,
    "serial" SERIAL NOT NULL,
    "reservationId" UUID NOT NULL,
    "concertSeatId" INTEGER NOT NULL,
    "holderName" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'VALID',
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bio" TEXT,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryItem" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GalleryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "message" TEXT NOT NULL,
    "handledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_mobile_key" ON "User"("mobile");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE INDEX "Seat_venueId_rowOrder_number_idx" ON "Seat"("venueId", "rowOrder", "number");
CREATE UNIQUE INDEX "Seat_venueId_rowLabel_number_key" ON "Seat"("venueId", "rowLabel", "number");
CREATE INDEX "Concert_status_startsAt_idx" ON "Concert"("status", "startsAt");
CREATE INDEX "Concert_venueId_idx" ON "Concert"("venueId");
CREATE INDEX "PriceTier_concertId_sortOrder_idx" ON "PriceTier"("concertId", "sortOrder");
CREATE INDEX "ConcertSeat_concertId_status_idx" ON "ConcertSeat"("concertId", "status");
CREATE INDEX "ConcertSeat_reservationId_idx" ON "ConcertSeat"("reservationId");
CREATE INDEX "ConcertSeat_status_heldUntil_idx" ON "ConcertSeat"("status", "heldUntil");
CREATE UNIQUE INDEX "ConcertSeat_concertId_seatId_key" ON "ConcertSeat"("concertId", "seatId");
CREATE INDEX "Reservation_userId_createdAt_idx" ON "Reservation"("userId", "createdAt");
CREATE INDEX "Reservation_concertId_status_idx" ON "Reservation"("concertId", "status");
CREATE INDEX "Reservation_status_expiresAt_idx" ON "Reservation"("status", "expiresAt");
CREATE UNIQUE INDEX "Reservation_userId_idempotencyKey_key" ON "Reservation"("userId", "idempotencyKey");
CREATE INDEX "ReservationItem_concertSeatId_idx" ON "ReservationItem"("concertSeatId");
CREATE UNIQUE INDEX "ReservationItem_reservationId_concertSeatId_key" ON "ReservationItem"("reservationId", "concertSeatId");
CREATE INDEX "Payment_reservationId_status_idx" ON "Payment"("reservationId", "status");
CREATE UNIQUE INDEX "Payment_provider_authority_key" ON "Payment"("provider", "authority");
CREATE INDEX "PaymentEvent_paymentId_createdAt_idx" ON "PaymentEvent"("paymentId", "createdAt");
CREATE UNIQUE INDEX "Ticket_serial_key" ON "Ticket"("serial");
CREATE INDEX "Ticket_reservationId_idx" ON "Ticket"("reservationId");
CREATE INDEX "Ticket_concertSeatId_idx" ON "Ticket"("concertSeatId");
CREATE INDEX "Member_isActive_sortOrder_idx" ON "Member"("isActive", "sortOrder");
CREATE UNIQUE INDEX "Instrument_key_key" ON "Instrument"("key");
CREATE INDEX "Instrument_isActive_sortOrder_idx" ON "Instrument"("isActive", "sortOrder");
CREATE INDEX "GalleryItem_isPublished_sortOrder_idx" ON "GalleryItem"("isPublished", "sortOrder");
CREATE INDEX "ContactMessage_createdAt_idx" ON "ContactMessage"("createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Concert" ADD CONSTRAINT "Concert_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PriceTier" ADD CONSTRAINT "PriceTier_concertId_fkey" FOREIGN KEY ("concertId") REFERENCES "Concert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConcertSeat" ADD CONSTRAINT "ConcertSeat_concertId_fkey" FOREIGN KEY ("concertId") REFERENCES "Concert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConcertSeat" ADD CONSTRAINT "ConcertSeat_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConcertSeat" ADD CONSTRAINT "ConcertSeat_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "PriceTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConcertSeat" ADD CONSTRAINT "ConcertSeat_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_concertId_fkey" FOREIGN KEY ("concertId") REFERENCES "Concert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReservationItem" ADD CONSTRAINT "ReservationItem_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReservationItem" ADD CONSTRAINT "ReservationItem_concertSeatId_fkey" FOREIGN KEY ("concertSeatId") REFERENCES "ConcertSeat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
