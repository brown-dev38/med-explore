-- NULL expiry represents a QR that remains valid until explicitly revoked.
ALTER TABLE `qr_sessions` MODIFY `expires_at` DATETIME(3) NULL;
