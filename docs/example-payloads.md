# Example Payloads

This document provides example input and output payloads for each available task.

## News Articles Task

### Input Example
```json
{
  "urls": [
    "https://example.com/news/article1",
    "https://example.com/news/article2"
  ],
  "options": {
    "concurrency": 3,
    "delayMs": 1000,
    "timeout": 15000,
    "maxRetries": 2,
    "extractContent": true,
    "extractImages": false,
    "maxContentLength": 5000,
    "dateFormat": "iso"
  }
}
```

### Output Example
```json
{
  "articles": [
    {
      "url": "https://example.com/news/article1",
      "title": "Breaking News: Important Event",
      "author": "John Doe",
      "publishedAt": "2025-01-01T10:00:00.000Z",
      "modifiedAt": "2025-01-01T11:00:00.000Z",
      "excerpt": "This is a brief summary of the article...",
      "content": "Full article content here...",
      "wordCount": 500,
      "readingTime": 2,
      "tags": ["news", "breaking", "politics"],
      "category": "Politics",
      "images": [
        {
          "src": "https://example.com/image1.jpg",
          "alt": "Article image",
          "caption": "Caption text",
          "width": 800,
          "height": 600
        }
      ],
      "metadata": {
        "extractedAt": "2025-01-01T12:00:00.000Z",
        "confidence": 0.9,
        "source": "news-task",
        "language": "en"
      }
    }
  ],
  "summary": {
    "total": 2,
    "successful": 2,
    "failed": 0,
    "averageTime": 1500,
    "errors": []
  },
  "metadata": {
    "jobId": "job-123",
    "task": "news",
    "startTime": "2025-01-01T12:00:00.000Z",
    "endTime": "2025-01-01T12:00:03.000Z",
    "duration": 3000
  }
}
```

## Sports Statistics Task

### Input Example
```json
{
  "urls": [
    "https://www.pro-football-reference.com/players/A/AllenJo00.htm",
    "https://www.pro-football-reference.com/players/B/BradyTo00.htm"
  ],
  "options": {
    "concurrency": 2,
    "delayMs": 2000,
    "timeout": 30000,
    "maxRetries": 3,
    "extractTables": true,
    "extractBiography": true,
    "extractAchievements": true,
    "includePlaceholderData": false,
    "sportsSite": "auto"
  }
}
```

### Output Example
```json
{
  "players": [
    {
      "url": "https://www.pro-football-reference.com/players/A/AllenJo00.htm",
      "name": "Josh Allen",
      "position": "QB",
      "team": "BUF",
      "biography": {
        "height": "6'5\"",
        "weight": "237 lbs",
        "born": "May 21, 1996",
        "college": "Wyoming",
        "draftYear": 2018,
        "draftRound": 1,
        "draftPick": 7
      },
      "statistics": {
        "passing": {
          "completions": 312,
          "attempts": 461,
          "yards": 4306,
          "touchdowns": 29,
          "interceptions": 10
        },
        "rushing": {
          "attempts": 102,
          "yards": 763,
          "touchdowns": 12
        }
      },
      "achievements": [
        "Pro Bowl (2020, 2021, 2022)",
        "AFC East Champion (2020, 2021, 2022)"
      ],
      "metadata": {
        "extractedAt": "2025-01-01T12:00:00.000Z",
        "confidence": 0.95,
        "source": "sports-task",
        "sportsSite": "pro-football-reference"
      }
    }
  ],
  "summary": {
    "total": 2,
    "successful": 2,
    "failed": 0,
    "averageTime": 2500,
    "errors": []
  },
  "metadata": {
    "jobId": "job-456",
    "task": "sports",
    "startTime": "2025-01-01T12:00:00.000Z",
    "endTime": "2025-01-01T12:00:05.000Z",
    "duration": 5000
  }
}
```

## Company Data Task

### Input Example
```json
{
  "urls": [
    "https://example.com/company1",
    "https://example.com/company2"
  ],
  "options": {
    "concurrency": 3,
    "delayMs": 1000,
    "timeout": 30000,
    "maxRetries": 3,
    "enablePaginationDiscovery": true,
    "enableUrlNormalization": true,
    "extractionDepth": "detailed"
  }
}
```

### Output Example
```json
{
  "companies": [
    {
      "url": "https://example.com/company1",
      "name": "Example Company Inc.",
      "pages": [
        {
          "url": "https://example.com/company1",
          "title": "Home - Example Company"
        },
        {
          "url": "https://example.com/company1/about",
          "title": "About Us - Example Company"
        },
        {
          "url": "https://example.com/company1/contact",
          "title": "Contact - Example Company"
        }
      ],
      "emails": [
        "info@example.com",
        "contact@example.com"
      ],
      "social": {
        "twitter": "https://twitter.com/examplecompany",
        "linkedin": "https://linkedin.com/company/example-company",
        "facebook": "https://facebook.com/examplecompany"
      },
      "techstack": [
        "React",
        "Node.js",
        "AWS",
        "MongoDB"
      ],
      "metadata": {
        "extractedAt": "2025-01-01T12:00:00.000Z",
        "confidence": 0.85,
        "source": "companies-task",
        "extractionDepth": "detailed"
      }
    }
  ],
  "summary": {
    "total": 2,
    "successful": 2,
    "failed": 0,
    "averageTime": 2000,
    "errors": []
  },
  "metadata": {
    "jobId": "job-789",
    "task": "companies",
    "startTime": "2025-01-01T12:00:00.000Z",
    "endTime": "2025-01-01T12:00:04.000Z",
    "duration": 4000
  }
}
```

## Error Response Example

### Input Validation Error
```json
{
  "error": "Validation failed",
  "details": [
    {
      "path": ["urls"],
      "message": "Array must contain at least 1 element(s)"
    },
    {
      "path": ["options", "concurrency"],
      "message": "Expected number, received string"
    }
  ]
}
```

### Task Execution Error
```json
{
  "error": "Task execution failed",
  "message": "Failed to process URL: https://invalid-url.com",
  "taskName": "news",
  "jobId": "job-123",
  "timestamp": "2025-01-01T12:00:00.000Z"
}
```

## API Response Examples

### Successful Job Start
```json
{
  "success": true,
  "jobId": "job-123",
  "taskName": "news",
  "status": "started",
  "message": "Job started successfully",
  "estimatedDuration": 30000
}
```

### Job Status Check
```json
{
  "jobId": "job-123",
  "status": "running",
  "progress": {
    "completed": 5,
    "total": 10,
    "percentage": 50
  },
  "startedAt": "2025-01-01T12:00:00.000Z",
  "estimatedCompletion": "2025-01-01T12:00:30.000Z"
}
```

### Job Completion
```json
{
  "jobId": "job-123",
  "status": "completed",
  "result": {
    // ... task output as shown above
  },
  "startedAt": "2025-01-01T12:00:00.000Z",
  "completedAt": "2025-01-01T12:00:03.000Z",
  "duration": 3000
}
```

## CSV Export Examples

### News Articles CSV
```csv
URL,Title,Author,Publish Date,Excerpt,Word Count,Category
https://example.com/article1,"Breaking News","John Doe","2025-01-01T10:00:00.000Z","Article summary...",500,Politics
https://example.com/article2,"Tech Update","Jane Smith","2025-01-01T11:00:00.000Z","Tech article summary...",750,Technology
```

### Sports Statistics CSV
```csv
URL,Name,Position,Team,Height,Weight,College,Draft Year
https://www.pro-football-reference.com/players/A/AllenJo00.htm,Josh Allen,QB,BUF,6'5",237 lbs,Wyoming,2018
https://www.pro-football-reference.com/players/B/BradyTo00.htm,Tom Brady,QB,TB,6'4",225 lbs,Michigan,2000
```

### Company Data CSV
```csv
URL,Name,Email,Twitter,LinkedIn,Facebook,Tech Stack
https://example.com/company1,Example Company Inc.,info@example.com,https://twitter.com/examplecompany,https://linkedin.com/company/example-company,https://facebook.com/examplecompany,"React,Node.js,AWS,MongoDB"
```