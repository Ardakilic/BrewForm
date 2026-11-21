## ADDED Requirements

### Requirement: Public base URLs are normalised without a trailing slash

The API environment loader SHALL strip every trailing `/` from `S3_PUBLIC_URL`, `PUBLIC_APP_URL` and `APP_URL` once, at load time, and code that builds a URL from them SHALL append paths with exactly one `/` and SHALL NOT trim the values again.

- The storage driver's `save()` return value SHALL be the photo URL that is stored (the local driver
  returns `/uploads/<key>`, the S3 driver `<S3_PUBLIC_URL>/<key>`); no second URL builder exists.

#### Scenario: A trailing slash in S3_PUBLIC_URL does not reach photo URLs

- **WHEN** the API starts with `STORAGE_DRIVER=s3` and `S3_PUBLIC_URL=https://cdn.example.com/`, and the recipe owner uploads a photo with a thumbnail
- **THEN** `config.S3_PUBLIC_URL` is `https://cdn.example.com` and the stored `url` and `thumbnailUrl` are `https://cdn.example.com/<uuid>.<ext>` and `https://cdn.example.com/<uuid>_medium.<ext>`

#### Scenario: A trailing slash in PUBLIC_APP_URL does not break email links

- **WHEN** the API runs with `PUBLIC_APP_URL=https://brewform.example.com/` and a password reset email is sent
- **THEN** the link in the email starts with `https://brewform.example.com/reset-password?token=`
