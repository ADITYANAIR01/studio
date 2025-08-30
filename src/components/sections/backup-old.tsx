'use client';

// DEPRECATED: This component is deprecated and will be removed in a future version
// Use backup.tsx instead which supports the new universal access system

import { useRef, useState, useEffect } from 'react';
import { useLocalStorage } from '@/hooks/use-local-storage';
import type { AppData, Password, ApiKey, GoogleBackupCode, StoredGoogleCode } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Upload, Download, ShieldCheck, Database } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { encryptData, decryptData } from '@/lib/utils';
// Note: This component is deprecated and should be removed after migration

interface BackupSectionProps {
  passwords?: Password[];
  setPasswords?: React.Dispatch<React.SetStateAction<Password[]>>;
}

export default function BackupSection({ passwords: propsPasswords, setPasswords: propsSetPasswords }: BackupSectionProps = {}) {
  const [localPasswords, setLocalPasswords] = useLocalStorage<Password[]>('citadel-passwords', []);
  const [apiKeys, setApiKeys] = useLocalStorage<ApiKey[]>('citadel-api-keys', []);
  const [googleCodes, setGoogleCodes] = useLocalStorage<StoredGoogleCode[]>('citadel-google-codes', []);
  
  // Use props if provided, otherwise use local state
  const passwords = propsPasswords || localPasswords;
  const setPasswords = propsSetPasswords || setLocalPasswords;
  const [importedData, setImportedData] = useState<AppData | null>(null);
  const [vaultStats, setVaultStats] = useState<{ totalItems: number; lastBackup?: number } | null>(null);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load vault statistics on component mount
  useEffect(() => {
    const loadVaultStats = async () => {
      try {
        const secureStorage = SecureStorageService.getInstance();
        const stats = await secureStorage.getVaultStats();
        setVaultStats(stats);
      } catch (error) {
        // Secure vault might not be initialized
        setVaultStats({ totalItems: 0 });
      }
    };
    loadVaultStats();
  }, []);


  const handleExport = async () => {
    const secret = prompt('Enter a passphrase to encrypt your backup:');
    if (!secret) return toast({ title: 'Export cancelled.' });
    
    try {
      // Get data from localStorage (legacy)
      const localPasswords = passwords;
      const localApiKeys = apiKeys;
      const localGoogleCodes = googleCodes;
      
      // Get secure vault data if available
      const secureStorage = SecureStorageService.getInstance();
      let secureVaultData = null;
      try {
        const stats = await secureStorage.getVaultStats();
        if (stats.totalItems > 0) {
          secureVaultData = await secureStorage.exportVault();
        }
      } catch (error) {
        console.log('No secure vault data to export');
      }
      
      // Get application settings from localStorage
      const settings = {
        theme: localStorage.getItem('theme'),
        language: localStorage.getItem('language'),
        autoLock: localStorage.getItem('auto-lock'),
        // Add any other settings here
      };
      
      const appData: AppData = { 
        passwords: localPasswords, 
        apiKeys: localApiKeys, 
        googleCodes: localGoogleCodes,
        secureVaultData,
        settings,
        exportedAt: new Date().toISOString(),
        version: '1.0.0'
      };
      
      const encrypted = encryptData(JSON.stringify(appData), secret);
      const blob = new Blob([encrypted], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `citadel-guard-backup-${new Date().toISOString().split('T')[0]}.enc`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: 'Complete backup exported successfully!', description: 'All passwords, API keys, backup codes, and settings included.' });
    } catch (error) {
      console.error('Export failed:', error);
      toast({ title: 'Export failed', description: 'An error occurred while creating the backup.', variant: 'destructive' });
    }
  };
  
  const triggerFileImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const encrypted = e.target?.result as string;
          const secret = prompt('Enter the passphrase to decrypt your backup:');
          if (!secret) throw new Error('No passphrase provided.');
          const decrypted = decryptData(encrypted, secret);
          const data = JSON.parse(decrypted) as AppData;
          
          // Validate backup file structure
          if (!data.passwords || !data.apiKeys || !data.googleCodes) {
            throw new Error('Invalid backup file format - missing required data arrays.');
          }
          
          // Basic validation for arrays
          if (!Array.isArray(data.passwords) || !Array.isArray(data.apiKeys) || !Array.isArray(data.googleCodes)) {
            throw new Error('Invalid backup file format - data is not in correct array format.');
          }
          
          setImportedData(data);
          toast({ 
            title: 'Backup file loaded successfully!', 
            description: `Found ${data.passwords.length} passwords, ${data.apiKeys.length} API keys, and ${data.googleCodes.length} backup codes.` 
          });
        } catch (error) {
          console.error('Import error:', error);
          toast({ 
            title: 'Import failed.', 
            description: error instanceof Error ? error.message : 'The selected file is not a valid encrypted backup file.', 
            variant: 'destructive' 
          });
        }
      };
      reader.readAsText(file);
    }
    // Reset file input
    if(fileInputRef.current) fileInputRef.current.value = "";
  };

  const proceedWithImport = async () => {
    if (!importedData) return;
    
    try {
      console.log('Starting data restore...', importedData);
      
      // Restore localStorage data
      console.log('Restoring passwords:', importedData.passwords?.length || 0);
      setPasswords(importedData.passwords || []);
      
      console.log('Restoring API keys:', importedData.apiKeys?.length || 0);
      setApiKeys(importedData.apiKeys || []);
      
      console.log('Restoring Google codes:', importedData.googleCodes?.length || 0);
      setGoogleCodes(importedData.googleCodes || []);
      
      // Restore secure vault data if present
      if (importedData.secureVaultData) {
        try {
          console.log('Restoring secure vault data...');
          const secureStorage = SecureStorageService.getInstance();
          await secureStorage.importVault(importedData.secureVaultData);
          console.log('Secure vault data restored successfully');
        } catch (error) {
          console.error('Failed to restore secure vault data:', error);
          toast({ 
            title: 'Partial restore completed', 
            description: 'Main data restored but secure vault data could not be imported.', 
            variant: 'destructive' 
          });
        }
      }
      
      // Restore settings if present
      if (importedData.settings) {
        console.log('Restoring settings:', importedData.settings);
        Object.entries(importedData.settings).forEach(([key, value]) => {
          if (value !== null && value !== undefined) {
            localStorage.setItem(key, value as string);
          }
        });
      }
      
      console.log('Data restore completed successfully');
      toast({ 
        title: 'Data restored successfully!', 
        description: `Restored ${importedData.passwords?.length || 0} passwords, ${importedData.apiKeys?.length || 0} API keys, and ${importedData.googleCodes?.length || 0} backup codes.` 
      });
      
      setImportedData(null);
      
    } catch (error) {
      console.error('Restore failed:', error);
      toast({ 
        title: 'Restore failed', 
        description: 'An error occurred while restoring your data.', 
        variant: 'destructive' 
      });
    }
  };

  return (
    <>
      <Card className="animate-slide-in-from-right">
        <CardHeader>
          <CardTitle>Backup & Restore</CardTitle>
          <CardDescription>Export all your data (passwords, API keys, backup codes, and settings) into a single encrypted file or restore from a backup.</CardDescription>
        </CardHeader>
        <CardContent>
            {/* View Backup Codes Section */}
            <Card className="mb-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                  View Backup Codes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!selectedEmail ? (
                  <div>
                    <label className="block mb-2 font-medium">Stored backup codes:</label>
                    <div className="space-y-2">
                      {googleCodes.length === 0 && (
                        <div className="text-muted-foreground">No backup codes found.</div>
                      )}
                      {googleCodes.map(({ id, email, platform, codes }) => (
                        <div 
                          key={id} 
                          className="p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                          onDoubleClick={() => setSelectedEmail(email)}
                        >
                          <div className="font-medium">{email}</div>
                          <div className="text-sm text-muted-foreground">Platform: {platform}</div>
                          <div className="text-xs text-muted-foreground">{codes.length} codes available</div>
                        </div>
                      ))}
                    </div>
                    {googleCodes.length > 0 && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        Double-click an entry to view backup codes
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <Button variant="ghost" size="sm" className="mb-2" onClick={() => setSelectedEmail(null)}>
                      ← Back to list
                    </Button>
                    <label className="block mb-2 font-medium">Backup Codes for {selectedEmail}:</label>
                    <div className="space-y-2">
                      {codesForSelectedEmail.length === 0 && (
                        <div className="text-muted-foreground">No codes found for this email.</div>
                      )}
                      {codesForSelectedEmail.flatMap(({ codes, platform }) =>
                        codes.map((code, index) => {
                          const isUsed = usedCodes[selectedEmail]?.has(code);
                          return (
                            <div key={`${code}-${index}`} className={`flex items-center justify-between p-2 border rounded ${isUsed ? 'opacity-50 bg-gray-100' : 'bg-white'}`}>
                              <div className="flex items-center gap-3">
                                <span className="font-mono text-sm">{index + 1}.</span>
                                <span className="font-mono bg-gray-100 px-2 py-1 rounded border">{code}</span>
                              </div>
                              {!isUsed ? (
                                <Button size="sm" variant="outline" onClick={() => handleCopyCode(selectedEmail, code)}>
                                  Copy
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">USED</span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Import Backup Codes Section */}
            <Card className="mb-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                  Import Backup Codes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={async e => {
                    e.preventDefault();
                    const form = e.target as HTMLFormElement;
                    const email = (form.email as HTMLInputElement).value.trim();
                    const platform = (form.platform as HTMLInputElement).value.trim();
                    const file = (form.codes as HTMLInputElement).files?.[0];
                    
                    if (!email || !platform || !file) {
                      toast({ title: 'Missing fields', description: 'Please provide email, platform, and select a .txt file.', variant: 'destructive' });
                      return;
                    }
                    
                    try {
                      const text = await file.text();
                      
                      // Parse Google backup codes format
                      const lines = text.split(/\r?\n/);
                      const codes: string[] = [];
                      
                      for (const line of lines) {
                        const trimmedLine = line.trim();
                        if (!trimmedLine) continue;
                        
                        // Match patterns like "1. ALREADY USED" or "3. 8374 9658"
                        const match = trimmedLine.match(/^\d+\.\s*(.+)$/);
                        if (match) {
                          const codeText = match[1].trim();
                          // Skip "ALREADY USED" entries
                          if (codeText.toUpperCase().includes('ALREADY USED')) {
                            continue;
                          }
                          // Store the code as-is (with spaces if present)
                          codes.push(codeText);
                        }
                        // Also handle lines that might just be codes without numbers
                        else if (/^\d{4}\s*\d{4}$/.test(trimmedLine)) {
                          codes.push(trimmedLine);
                        }
                      }
                      
                      if (codes.length === 0) {
                        toast({ 
                          title: 'No valid codes found', 
                          description: 'The file does not contain any valid backup codes.', 
                          variant: 'destructive' 
                        });
                        return;
                      }
                      
                      // Store codes under the correct email/platform
                      setGoogleCodes(prev => {
                        // Remove any existing entry for this email/platform combination
                        const filtered = prev.filter(c => !(c.email === email && c.platform === platform));
                        return [
                          ...filtered,
                          { id: `${email}-${platform}-${Date.now()}`, email, platform, codes }
                        ];
                      });
                      
                      toast({ 
                        title: 'Backup codes imported successfully!', 
                        description: `Imported ${codes.length} valid codes for ${email} (${platform}).` 
                      });
                      form.reset();
                      
                    } catch (error) {
                      console.error('Import error:', error);
                      toast({ 
                        title: 'Import failed', 
                        description: 'Failed to read or parse the backup codes file.', 
                        variant: 'destructive' 
                      });
                    }
                  }}
                >
                  <div className="mb-4">
                    <label className="block mb-2 font-medium">Email Address:</label>
                    <input 
                      name="email" 
                      type="email" 
                      className="border rounded-md px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500" 
                      placeholder="example@gmail.com"
                      required 
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block mb-2 font-medium">Platform:</label>
                    <input 
                      name="platform" 
                      type="text" 
                      className="border rounded-md px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500" 
                      placeholder="Google, GitHub, etc."
                      required 
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block mb-2 font-medium">Import from .txt file:</label>
                    <input 
                      name="codes" 
                      type="file" 
                      accept=".txt" 
                      className="border rounded-md px-3 py-2 w-full file:mr-4 file:py-1 file:px-2 file:rounded file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" 
                      required 
                    />
                    <div className="text-xs text-muted-foreground mt-1">
                      Upload a .txt file with backup codes (supports Google backup codes format)
                    </div>
                  </div>
                  <Button type="submit" variant="default" className="w-full">
                    Import Backup Codes
                  </Button>
                </form>
              </CardContent>
            </Card>
          {/* Backup Statistics */}
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <Database className="h-5 w-5" />
                Data Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-blue-600">{passwords.length}</div>
                  <div className="text-sm text-muted-foreground">Passwords</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">{apiKeys.length}</div>
                  <div className="text-sm text-muted-foreground">API Keys</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-600">{googleCodes.length}</div>
                  <div className="text-sm text-muted-foreground">Backup Codes</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-orange-600">{vaultStats?.totalItems || 0}</div>
                  <div className="text-sm text-muted-foreground">Secure Items</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-lg font-medium">Export Data</CardTitle>
                    <Download className="h-5 w-5 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                        Create a complete backup of all your passwords, API keys, backup codes, secure vault data, and application settings. This encrypted backup contains everything needed to fully restore your account.
                    </p>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button>
                          <Download className="mr-2 h-4 w-4" /> Export Complete Backup
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="flex items-center gap-2"><ShieldCheck/> Manual Encryption (Optional)</AlertDialogTitle>
                          <AlertDialogDescription>
                            For enhanced security, you can manually encrypt the backup file using an external tool like GPG or VeraCrypt after exporting.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleExport}>Export Unencrypted</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-lg font-medium">Import Data</CardTitle>
                     <Upload className="h-5 w-5 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                        Restore your complete data from a previously exported backup file. This will restore passwords, API keys, backup codes, secure vault data, and settings. Current data will be overwritten.
                    </p>
                    <input type="file" ref={fileInputRef} onChange={handleFileImport} className="hidden" />
                    <Button variant="outline" onClick={triggerFileImport}>
                      <Upload className="mr-2 h-4 w-4" /> Import from Backup
                    </Button>
                </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!importedData} onOpenChange={(open) => !open && setImportedData(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Overwrite all existing data?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Importing a backup will replace all passwords, API keys, backup codes, secure vault data, and application settings currently stored in the application.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setImportedData(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={proceedWithImport}>Yes, Overwrite Data</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
