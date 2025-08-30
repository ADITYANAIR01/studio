/**
 * Data Migration Component
 * Provides UI for migrating localStorage data to Firestore
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DataMigrationService, type MigrationResult } from '@/services/DataMigrationService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, AlertCircle, Cloud, Database, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface LocalDataSummary {
  passwords: number;
  apiKeys: number;
  googleCodes: number;
  hasSettings: boolean;
}

export default function DataMigrationComponent() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [localDataSummary, setLocalDataSummary] = useState<LocalDataSummary | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [hasMigratedData, setHasMigratedData] = useState(false);
  const [progress, setProgress] = useState(0);

  // Check local data and migration status
  useEffect(() => {
    if (!user) return;

    // Check local data
    const getLocalCount = (key: string) => {
      try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data).length || 0 : 0;
      } catch {
        return 0;
      }
    };

    const summary: LocalDataSummary = {
      passwords: getLocalCount('citadel-passwords'),
      apiKeys: getLocalCount('citadel-api-keys'),
      googleCodes: getLocalCount('citadel-google-codes'),
      hasSettings: !!(
        localStorage.getItem('theme') ||
        localStorage.getItem('language') ||
        localStorage.getItem('auto-lock')
      )
    };

    setLocalDataSummary(summary);

    // Check if user has already migrated
    DataMigrationService.hasMigratedData(user.uid)
      .then(setHasMigratedData)
      .catch(error => {
        console.error('Error checking migration status:', error);
      });
  }, [user]);

  const handleMigration = async () => {
    if (!user || !localDataSummary) return;

    setIsMigrating(true);
    setProgress(0);

    try {
      // Create backup first
      const backup = DataMigrationService.createLocalStorageBackup();
      console.log('Created backup:', backup);

      // Simulate progress
      setProgress(25);

      // Perform migration
      const result = await DataMigrationService.migrateToFirestore(user.uid);
      setProgress(75);

      setMigrationResult(result);
      setProgress(100);

      if (result.success) {
        toast({
          title: "Migration Successful!",
          description: `Migrated ${result.passwordsCount} passwords, ${result.apiKeysCount} API keys, ${result.googleCodesCount} Google codes, and settings to cloud storage.`,
        });

        // Offer to clear localStorage
        if (window.confirm('Migration successful! Would you like to clear the local data now that it\'s safely stored in the cloud?')) {
          DataMigrationService.clearLocalStorageData();
          setLocalDataSummary(prev => prev ? {
            passwords: 0,
            apiKeys: 0,
            googleCodes: 0,
            hasSettings: false
          } : null);
        }

        setHasMigratedData(true);
      } else {
        toast({
          variant: "destructive",
          title: "Migration Failed",
          description: result.errors.join(', '),
        });
      }

    } catch (error) {
      console.error('Migration error:', error);
      toast({
        variant: "destructive",
        title: "Migration Error",
        description: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    } finally {
      setIsMigrating(false);
    }
  };

  const downloadBackup = () => {
    const backup = DataMigrationService.createLocalStorageBackup();
    const blob = new Blob([backup], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `citadel-guard-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Backup Downloaded",
      description: "Your data backup has been saved to your downloads folder.",
    });
  };

  if (!user) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Please sign in to access data migration.
        </AlertDescription>
      </Alert>
    );
  }

  if (!localDataSummary) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">Loading data summary...</div>
        </CardContent>
      </Card>
    );
  }

  const totalLocalItems = localDataSummary.passwords + localDataSummary.apiKeys + localDataSummary.googleCodes + (localDataSummary.hasSettings ? 1 : 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Cloud Migration
          </CardTitle>
          <CardDescription>
            Migrate your local data to secure cloud storage for cross-device synchronization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <Database className="h-4 w-4" />
                Local Data Summary
              </h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Passwords:</span>
                  <Badge variant="secondary">{localDataSummary.passwords}</Badge>
                </div>
                <div className="flex justify-between">
                  <span>API Keys:</span>
                  <Badge variant="secondary">{localDataSummary.apiKeys}</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Google Codes:</span>
                  <Badge variant="secondary">{localDataSummary.googleCodes}</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Settings:</span>
                  <Badge variant={localDataSummary.hasSettings ? "secondary" : "outline"}>
                    {localDataSummary.hasSettings ? "Yes" : "No"}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <Cloud className="h-4 w-4" />
                Cloud Status
              </h4>
              <div className="text-sm">
                {hasMigratedData ? (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    Data already in cloud
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-orange-600">
                    <AlertCircle className="h-4 w-4" />
                    No cloud data found
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Migration Progress */}
          {isMigrating && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Migration Progress</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          {/* Migration Result */}
          {migrationResult && (
            <Alert variant={migrationResult.success ? "default" : "destructive"}>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                {migrationResult.success ? (
                  <>
                    Migration completed successfully! 
                    Migrated {migrationResult.passwordsCount} passwords, {migrationResult.apiKeysCount} API keys, 
                    {migrationResult.googleCodesCount} Google codes, and {migrationResult.settingsCount} settings.
                  </>
                ) : (
                  <>Migration failed: {migrationResult.errors.join(', ')}</>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={handleMigration}
              disabled={isMigrating || totalLocalItems === 0}
              className="flex-1"
            >
              {isMigrating ? 'Migrating...' : 'Migrate to Cloud'}
            </Button>
            
            <Button
              variant="outline"
              onClick={downloadBackup}
              disabled={totalLocalItems === 0}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Download Backup
            </Button>
          </div>

          {totalLocalItems === 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No local data found to migrate.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
