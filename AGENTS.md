Please also reference the following rules as needed. The list below is provided in TOON format, and `@` stands for the project root directory.

rules[7]{path}:
  @.opencode/memories/api-development.md
  @.opencode/memories/common-guidelines.md
  @.opencode/memories/database.md
  @.opencode/memories/frontend.md
  @.opencode/memories/infrastructure.md
  @.opencode/memories/mcp.md
  @.opencode/memories/style-guidelines.md

# Project Overview

## General Guidelines

- Use TypeScript for all new code
- Follow consistent naming conventions
- Write self-documenting code with clear variable and function names
- Prefer composition over inheritance
- Use meaningful comments for complex business logic

## Code Style

- Use 2 spaces for indentation
- Use semicolons
- Use double quotes for strings
- Use trailing commas in multi-line objects and arrays

## Architecture Principles

- Organize code by feature, not by file type
- Keep related files close together
- Use dependency injection for better testability
- Implement proper error handling
- Follow single responsibility principle
