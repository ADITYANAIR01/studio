'use client';

import { useRef, useState, useEffect } from 'react';
import { SecureStorageService } from '@/services/SecureStorageService';
import { useLocalStorage } from '@/hooks/use-local-storage';
import type { AppData, Password, ApiKey, StoredGoogleCode } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Upload, Download, ShieldCheck, Database } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { encryptData, decryptData } from '@/lib/utils';
import { getAllCredentials } from '@/lib/firebase-secure';
import { useAuth } from '@/contexts/AuthContext';

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
  // Provide stable reference in case SecureStorageService missing at runtime
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
          {/* Data Summary */}
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
