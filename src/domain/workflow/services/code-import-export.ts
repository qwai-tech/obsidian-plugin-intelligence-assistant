/**
 * Workflow System V2 - Code Import/Export Service
 *
 * Provides functionality to export workflows as code (JSON, YAML, or TypeScript)
 * and import them back into the system.
 */

import { Workflow, WorkflowNode, Connection } from '../core/types';
import { WorkflowGraph } from '../core/workflow';

export interface ExportOptions {
  format: 'json' | 'yaml' | 'typescript';
  includeMetadata?: boolean;
  includeExecutionHistory?: boolean;
  includeComments?: boolean;
}

export interface ImportResult {
  success: boolean;
  workflow?: WorkflowGraph;
  errors: string[];
  warnings: string[];
}

export class CodeImportExportService {
  /**
   * Export workflow as code in the specified format
   */
  export(workflow: WorkflowGraph, options: ExportOptions = { format: 'json' }): string {
    const workflowData = workflow.toJSON();
    
    switch (options.format) {
      case 'json':
        return this.exportAsJson(workflowData, options);
      case 'typescript':
        return this.exportAsTypescript(workflowData, options);
      case 'yaml':
        return this.exportAsYaml(workflowData, options);
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }
  }

  /**
   * Export as JSON format
   */
  private exportAsJson(workflow: Workflow, options: ExportOptions): string {
    const exportData = {
      ...(options.includeMetadata ? { metadata: this.getMetadata(workflow) } : {}),
      workflow: {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        nodes: workflow.nodes,
        connections: workflow.connections,
      },
      ...(options.includeComments ? { comments: this.extractComments(workflow) } : {}),
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export as TypeScript code
   */
  private exportAsTypescript(workflow: Workflow, options: ExportOptions): string {
    const codeLines = [
      '/**',
      ` * Workflow: ${workflow.name}`,
      ` * Generated: ${new Date().toISOString()}`,
      ` * ID: ${workflow.id}`,
      ' */',
      '',
      'import { WorkflowGraph } from \'@/domain/workflow\';',
      '',
      `const workflowData = ${JSON.stringify({
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        nodes: workflow.nodes,
        connections: workflow.connections
      }, null, 2).replace(/\n/g, '\n  ')};`,
      '',
      'export const createWorkflow = () => {',
      '  return WorkflowGraph.fromJSON(workflowData);',
      '};',
      '',
      `// Usage:`,
      `// import { createWorkflow } from './workflows/${workflow.name.toLowerCase().replace(/\s+/g, '-')}'`,
      `// const workflow = createWorkflow();`,
    ];

    return codeLines.join('\n');
  }

  /**
   * Export as YAML format
   */
  private exportAsYaml(workflow: Workflow, options: ExportOptions): string {
    let yaml = `# Workflow: ${workflow.name}\n`;
    yaml += `# Generated: ${new Date().toISOString()}\n`;
    yaml += `# ID: ${workflow.id}\n\n`;
    
    yaml += `workflow:\n`;
    yaml += `  id: ${workflow.id}\n`;
    yaml += `  name: ${workflow.name}\n`;
    yaml += `  description: ${workflow.description || ''}\n`;
    yaml += `  nodes:\n`;
    
    for (const node of workflow.nodes) {
      yaml += `    - id: ${node.id}\n`;
      yaml += `      type: ${node.type}\n`;
      yaml += `      name: ${node.name}\n`;
      yaml += `      x: ${node.x}\n`;
      yaml += `      y: ${node.y}\n`;
      yaml += `      config: ${JSON.stringify(node.config)}\n`;
    }
    
    yaml += `  connections:\n`;
    for (const conn of workflow.connections) {
      yaml += `    - from: ${conn.from}\n`;
      yaml += `      to: ${conn.to}\n`;
    }

    return yaml;
  }

  /**
   * Import workflow from code
   */
  import(code: string, format?: 'json' | 'yaml' | 'typescript'): ImportResult {
    try {
      let workflowData: any;

      if (format === 'yaml' || this.isYaml(code)) {
        workflowData = this.parseYaml(code);
      } else if (format === 'typescript' || this.isTypescript(code)) {
        workflowData = this.parseTypescript(code);
      } else {
        // Default to JSON
        workflowData = this.parseJson(code);
      }

      // If the parsed data has a wrapper object, extract the workflow
      if (workflowData.workflow) {
        workflowData = workflowData.workflow;
      }

      // Validate the workflow data
      const validationErrors = this.validateWorkflowData(workflowData);
      if (validationErrors.length > 0) {
        return {
          success: false,
          errors: validationErrors,
          warnings: [],
        };
      }

      // Create and return the workflow
      const workflowGraph = WorkflowGraph.fromJSON(workflowData);
      
      return {
        success: true,
        workflow: workflowGraph,
        errors: [],
        warnings: [],
      };
    } catch (error: any) {
      return {
        success: false,
        errors: [error.message],
        warnings: [],
      };
    }
  }

  /**
   * Parse JSON format
   */
  private parseJson(json: string): any {
    try {
      return JSON.parse(json);
    } catch (error) {
      throw new Error(`Invalid JSON: ${(error as Error).message}`);
    }
  }

  /**
   * Parse YAML format (simplified - would need a proper YAML parser in real implementation)
   */
  private parseYaml(yaml: string): any {
    // This is a simplified YAML parser - a real implementation would use a proper library
    // For now, we'll convert simple YAML to JSON by extracting the workflow section
    
    // Look for the workflow section in the YAML
    const workflowSectionMatch = yaml.match(/workflow:\s*([\s\S]*?)(?=\n\w+:|$)/);
    if (!workflowSectionMatch) {
      throw new Error('No workflow section found in YAML');
    }

    const workflowSection = workflowSectionMatch[1];
    
    // Extract individual fields
    const workflowData: any = {
      nodes: [],
      connections: []
    };

    // Extract basic fields
    const idMatch = yaml.match(/id:\s*(.+)/);
    const nameMatch = yaml.match(/name:\s*(.+)/);
    const descriptionMatch = yaml.match(/description:\s*(.+)/);

    if (idMatch) workflowData.id = idMatch[1].trim();
    if (nameMatch) workflowData.name = nameMatch[1].trim();
    if (descriptionMatch) workflowData.description = descriptionMatch[1].trim();

    // Parse nodes
    const nodeMatches = workflowSection.match(/(\s+-\s*id:\s*(\S+)[\s\S]*?)(?=\n\s*-\s*id:|\n\s*connections:|$)/g);
    if (nodeMatches) {
      for (const match of nodeMatches) {
        const node: any = {};
        const id = match.match(/id:\s*(\S+)/)?.[1];
        const type = match.match(/type:\s*(\S+)/)?.[1];
        const name = match.match(/name:\s*(.+)/)?.[1]?.trim();
        const x = match.match(/x:\s*(\d+)/)?.[1];
        const y = match.match(/y:\s*(\d+)/)?.[1];
        const configMatch = match.match(/config:\s*(.+)/)?.[1];

        if (id) node.id = id;
        if (type) node.type = type;
        if (name) node.name = name;
        if (x) node.x = parseInt(x);
        if (y) node.y = parseInt(y);
        if (configMatch) {
          try {
            node.config = JSON.parse(configMatch);
          } catch {
            node.config = configMatch; // Keep as string if not valid JSON
          }
        } else {
          node.config = {};
        }

        if (node.id) workflowData.nodes.push(node);
      }
    }

    // Parse connections
    const connectionSection = yaml.match(/connections:\s*([\s\S]*)/)?.[1];
    if (connectionSection) {
      const connMatches = connectionSection.match(/(\s+-\s*from:\s*(\S+)\s+to:\s*(\S+))/g);
      if (connMatches) {
        for (const match of connMatches) {
          const from = match.match(/from:\s*(\S+)/)?.[1];
          const to = match.match(/to:\s*(\S+)/)?.[1];
          if (from && to) {
            workflowData.connections.push({ from, to });
          }
        }
      }
    }

    return workflowData;
  }

  /**
   * Parse TypeScript format (extracts JSON object from TS file)
   */
  private parseTypescript(ts: string): any {
    // Look for the workflow data object in the TypeScript code
    const workflowMatch = ts.match(/workflowData\s*=\s*(\{[\s\S]*?\});/);
    if (!workflowMatch) {
      // If no explicit workflowData, look for any JSON-like object that could be workflow
      const jsonMatch = ts.match(/\{[\s\S]*?"nodes"[\s\S]*?\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('No workflow data object found in TypeScript code');
    }

    // Extract the JSON portion and parse it
    const jsonPart = workflowMatch[1];
    return JSON.parse(jsonPart);
  }

  /**
   * Check if code is likely YAML
   */
  private isYaml(code: string): boolean {
    return code.includes('workflow:') && (code.includes('nodes:') || code.includes('connections:'));
  }

  /**
   * Check if code is likely TypeScript
   */
  private isTypescript(code: string): boolean {
    return code.includes('import') && (code.includes('WorkflowGraph') || code.includes('createWorkflow'));
  }

  /**
   * Validate workflow data structure
   */
  private validateWorkflowData(data: any): string[] {
    const errors: string[] = [];

    if (!data.id) errors.push('Workflow must have an ID');
    if (!data.name) errors.push('Workflow must have a name');
    if (!Array.isArray(data.nodes)) errors.push('Workflow must have a nodes array');
    if (!Array.isArray(data.connections)) errors.push('Workflow must have a connections array');

    // More detailed validation could be added here
    if (data.nodes) {
      for (const node of data.nodes) {
        if (!node.id) errors.push('All nodes must have an ID');
        if (!node.type) errors.push(`Node ${node.id || 'unknown'} must have a type`);
      }
    }

    if (data.connections) {
      for (const conn of data.connections) {
        if (!conn.from) errors.push('All connections must have a "from" field');
        if (!conn.to) errors.push('All connections must have a "to" field');
      }
    }

    return errors;
  }

  /**
   * Extract metadata from workflow
   */
  private getMetadata(workflow: Workflow): any {
    return {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      created: new Date(workflow.created).toISOString(),
      updated: new Date(workflow.updated).toISOString(),
      nodeCount: workflow.nodes.length,
      connectionCount: workflow.connections.length,
    };
  }

  /**
   * Extract comments from workflow (simplified)
   */
  private extractComments(workflow: Workflow): string[] {
    // In a real implementation, this would extract comments from nodes, connections, etc.
    return [`Workflow: ${workflow.name}`, `Nodes: ${workflow.nodes.length}`, `Connections: ${workflow.connections.length}`];
  }

  /**
   * Import workflow from a file
   */
  async importFromFile(file: File): Promise<ImportResult> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const content = e.target?.result as string;
        let format: 'json' | 'yaml' | 'typescript' | undefined;
        
        if (file.name.endsWith('.json')) {
          format = 'json';
        } else if (file.name.endsWith('.yaml') || file.name.endsWith('.yml')) {
          format = 'yaml';
        } else if (file.name.endsWith('.ts')) {
          format = 'typescript';
        }
        
        resolve(this.import(content, format));
      };
      
      reader.onerror = () => {
        resolve({
          success: false,
          errors: ['Failed to read file'],
          warnings: [],
        });
      };
      
      reader.readAsText(file);
    });
  }

  /**
   * Export workflow to file
   */
  exportToFile(workflow: WorkflowGraph, options: ExportOptions): Blob {
    const content = this.export(workflow, options);
    const mimeType = options.format === 'json' ? 'application/json' : 
                    options.format === 'yaml' ? 'application/yaml' : 
                    'application/typescript';
    
    return new Blob([content], { type: mimeType });
  }
}