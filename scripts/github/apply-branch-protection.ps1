param(
  [string]$Repository = "Jeff-Kazzee/jolly-bear-cheer"
)

$ErrorActionPreference = "Stop"

$policy = @{
  required_status_checks = @{
    strict = $true
    contexts = @("check")
  }
  enforce_admins = $true
  required_pull_request_reviews = @{
    dismiss_stale_reviews = $true
    require_code_owner_reviews = $false
    required_approving_review_count = 0
    require_last_push_approval = $false
  }
  restrictions = $null
  required_linear_history = $true
  allow_force_pushes = $false
  allow_deletions = $false
  block_creations = $false
  required_conversation_resolution = $true
  lock_branch = $false
  allow_fork_syncing = $false
}

$body = $policy | ConvertTo-Json -Depth 10 -Compress

foreach ($branch in @("dev", "prod", "main")) {
  $body | gh api --method PUT "repos/$Repository/branches/$branch/protection" --input - | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to protect $branch"
  }
  Write-Host "Protected $branch"
}
