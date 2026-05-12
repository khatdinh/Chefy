param(
  [Parameter(Mandatory = $true)]
  [string]$DomainName,

  [Parameter(Mandatory = $true)]
  [string]$HostedZoneId,

  [string]$StackName = "chefcraft",
  [string]$Region = "us-east-1",
  [string]$OpenAIModel = "gpt-5-mini",
  [int]$MaxConcurrentRequests = 2
)

$ErrorActionPreference = "Stop"

function Get-AwsCommand {
  $command = Get-Command "aws" -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $localInstall = Join-Path $env:LOCALAPPDATA "Programs\Amazon\AWSCLIV2\aws.exe"
  if (Test-Path $localInstall) {
    return $localInstall
  }

  throw "AWS CLI is not installed or not on PATH."
}

$Aws = Get-AwsCommand

$repoRoot = Split-Path -Parent $PSScriptRoot
$buildDir = Join-Path $repoRoot ".deploy"
$packagedTemplate = Join-Path $buildDir "packaged.yaml"

New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

$identity = & $Aws sts get-caller-identity --output json | ConvertFrom-Json
$accountId = $identity.Account
$artifactsBucket = "$StackName-artifacts-$accountId-$Region".ToLower()

$bucketExists = $true
& $Aws s3api head-bucket --bucket $artifactsBucket 2>$null
if ($LASTEXITCODE -ne 0) {
  $bucketExists = $false
}

if (-not $bucketExists) {
  if ($Region -eq "us-east-1") {
    & $Aws s3api create-bucket --bucket $artifactsBucket | Out-Null
  } else {
    & $Aws s3api create-bucket `
      --bucket $artifactsBucket `
      --create-bucket-configuration LocationConstraint=$Region | Out-Null
  }
}

& $Aws s3api put-public-access-block `
  --bucket $artifactsBucket `
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true | Out-Null

$originSecretBytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($originSecretBytes)
$originSecret = [Convert]::ToBase64String($originSecretBytes)

& $Aws cloudformation package `
  --region $Region `
  --template-file (Join-Path $repoRoot "template.yaml") `
  --s3-bucket $artifactsBucket `
  --output-template-file $packagedTemplate | Out-Null

& $Aws cloudformation deploy `
  --region $Region `
  --stack-name $StackName `
  --template-file $packagedTemplate `
  --capabilities CAPABILITY_IAM `
  --parameter-overrides `
    DomainName=$DomainName `
    HostedZoneId=$HostedZoneId `
    OpenAIModel=$OpenAIModel `
    MaxConcurrentRequests=$MaxConcurrentRequests `
    ApiOriginSecret=$originSecret

$functionName = & $Aws cloudformation describe-stacks `
  --region $Region `
  --stack-name $StackName `
  --query "Stacks[0].Outputs[?OutputKey=='FunctionName'].OutputValue" `
  --output text

$openAiKey = Read-Host "Paste your OpenAI API key" -AsSecureString
$openAiKeyPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($openAiKey)
)

& $Aws lambda update-function-configuration `
  --region $Region `
  --function-name $functionName `
  --environment "Variables={OPENAI_API_KEY=$openAiKeyPlain,OPENAI_MODEL=$OpenAIModel,API_ORIGIN_SECRET=$originSecret}" | Out-Null

$bucket = & $Aws cloudformation describe-stacks `
  --region $Region `
  --stack-name $StackName `
  --query "Stacks[0].Outputs[?OutputKey=='SiteBucketName'].OutputValue" `
  --output text

$distribution = & $Aws cloudformation describe-stacks `
  --region $Region `
  --stack-name $StackName `
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" `
  --output text

& $Aws s3 sync (Join-Path $repoRoot "frontend") "s3://$bucket" --delete
& $Aws cloudfront create-invalidation --distribution-id $distribution --paths "/*" | Out-Null

$siteUrl = & $Aws cloudformation describe-stacks `
  --region $Region `
  --stack-name $StackName `
  --query "Stacks[0].Outputs[?OutputKey=='SiteUrl'].OutputValue" `
  --output text

Write-Host ""
Write-Host "ChefCraft is deployed:"
Write-Host $siteUrl
