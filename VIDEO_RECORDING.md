# Video Recording Configuration

This project now supports video recording for Playwright tests. Videos are automatically recorded during test execution and can help with debugging test failures.

## Configuration

The video recording is configured in `playwright.config.ts` with the following settings:

### Global Configuration

```typescript
use: {
  video: 'retain-on-failure',
  // videoSize: { width: 1280, height: 720 },
  // videoQuality: 'low',
}
```

### Project-Specific Configuration

Each browser project has individual video settings:

```typescript
{
  name: 'chrome',
  use: {
    video: {
      mode: 'retain-on-failure',
      size: { width: 1280, height: 720 }
    }
  }
}
```

## Video Recording Modes

### `retain-on-failure` (Default)
- Records videos for all tests
- Only keeps videos for failed tests
- Deletes videos for passed tests automatically
- Recommended for CI/CD environments

### `on`
- Records videos for all tests
- Keeps all videos regardless of test result
- Useful for debugging or demo purposes
- Requires more storage space

### `off`
- Disables video recording completely
- Use when video recording is not needed

## Video Options

### Video Size
Configure the video resolution:
```typescript
video: {
  mode: 'retain-on-failure',
  size: { width: 1280, height: 720 }  // 720p HD
}
```

Common resolutions:
- `{ width: 1920, height: 1080 }` - 1080p Full HD
- `{ width: 1280, height: 720 }` - 720p HD
- `{ width: 1024, height: 768 }` - Standard resolution

### Video Quality (Global setting only)
```typescript
use: {
  video: 'retain-on-failure',
  videoQuality: 'low'  // 'low' or 'high'
}
```

- `low`: Smaller file size, lower quality
- `high`: Larger file size, better quality

## Video Storage

Videos are stored in the `test-results` directory by default:
```
test-results/
├── [test-name]-[browser]/
│   ├── video.webm
│   └── other-test-artifacts
```

## Environment-Specific Settings

### CI/CD Environments
- Videos are automatically configured for CI environments
- Only failed test videos are retained to save storage
- Videos help with debugging issues in headless environments

### Local Development
- You can change the video mode to `'on'` for local debugging
- Videos help understand test behavior and failures

## Customizing Video Recording

### Per-Test Video Recording
You can override video settings in individual tests:

```typescript
test('my test', async ({ page }) => {
  // This test will have video recorded regardless of global settings
  await test.step('record this step', async () => {
    await page.goto('https://example.com');
  });
});
```

### Conditional Video Recording
```typescript
// In playwright.config.ts
video: process.env.RECORD_VIDEO === 'true' ? 'on' : 'retain-on-failure'
```

Then run tests with:
```bash
RECORD_VIDEO=true npm run test
```

## Viewing Videos

1. After test execution, check the `test-results` directory
2. Navigate to the specific test folder
3. Open `video.webm` in any modern browser or video player
4. Videos show the exact browser interactions during the test

## Troubleshooting

### Large Video Files
- Use `videoQuality: 'low'` to reduce file size
- Use smaller video dimensions
- Consider using `retain-on-failure` mode

### Missing Videos
- Ensure the test actually opens a browser context
- Check that video recording is not disabled in the specific project
- Verify sufficient disk space is available

### Performance Impact
- Video recording adds minimal overhead to test execution
- File I/O occurs after test completion
- Consider disabling for performance-critical test suites

## Examples

### Record All Tests (Development)
```typescript
use: {
  video: 'on',
  videoSize: { width: 1920, height: 1080 },
  videoQuality: 'high'
}
```

### Minimal Recording (CI)
```typescript
use: {
  video: 'retain-on-failure',
  videoSize: { width: 1024, height: 768 },
  videoQuality: 'low'
}
```

### Disable Recording
```typescript
use: {
  video: 'off'
}
```