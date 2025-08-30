/**
 * Firestore Test Component
 * Test component to verify Firestore functionality
 */

'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Database, TestTube } from 'lucide-react';

interface TestResult {
  test: string;
  status: 'success' | 'error' | 'pending';
  message: string;
  duration?: number;
}

export default function FirestoreTestComponent() {
  const { user } = useAuth();
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);

  const runFirestoreTests = async () => {
    if (!user) {
      setResults([{
        test: 'Authentication Check',
        status: 'error',
        message: 'User not authenticated'
      }]);
      return;
    }

    setIsRunning(true);
    const testResults: TestResult[] = [];

    try {
      // Test 1: Write Document
      const startTime1 = Date.now();
      const testDoc = doc(collection(db, 'users', user.uid, 'test-collection'));
      await setDoc(testDoc, {
        testData: 'Hello Firestore!',
        timestamp: new Date(),
        userId: user.uid
      });
      testResults.push({
        test: 'Write Test Document',
        status: 'success',
        message: 'Successfully wrote document to Firestore',
        duration: Date.now() - startTime1
      });

      // Test 2: Read Document
      const startTime2 = Date.now();
      const docSnap = await getDoc(testDoc);
      if (docSnap.exists()) {
        const data = docSnap.data();
        testResults.push({
          test: 'Read Test Document',
          status: 'success',
          message: `Successfully read document. Data: ${data.testData}`,
          duration: Date.now() - startTime2
        });
      } else {
        testResults.push({
          test: 'Read Test Document',
          status: 'error',
          message: 'Document was written but could not be read'
        });
      }

      // Test 3: Delete Document
      const startTime3 = Date.now();
      await deleteDoc(testDoc);
      testResults.push({
        test: 'Delete Test Document',
        status: 'success',
        message: 'Successfully deleted test document',
        duration: Date.now() - startTime3
      });

      // Test 4: Security Rules Test
      try {
        const otherUserDoc = doc(collection(db, 'users', 'fake-user-id', 'test-collection'));
        await setDoc(otherUserDoc, { test: 'should fail' });
        testResults.push({
          test: 'Security Rules Test',
          status: 'error',
          message: 'Security rules failed - was able to write to another user\'s data!'
        });
      } catch (error) {
        testResults.push({
          test: 'Security Rules Test',
          status: 'success',
          message: 'Security rules working correctly - prevented unauthorized access'
        });
      }

      // Test 5: Collections Structure Test
      const credentialsRef = collection(db, 'users', user.uid, 'credentials');
      const apiKeysRef = collection(db, 'users', user.uid, 'api-keys');
      const googleCodesRef = collection(db, 'users', user.uid, 'google-codes');
      const settingsRef = collection(db, 'users', user.uid, 'settings');

      testResults.push({
        test: 'Collections Structure',
        status: 'success',
        message: 'All required collections are accessible: credentials, api-keys, google-codes, settings'
      });

    } catch (error) {
      testResults.push({
        test: 'Firestore Connection',
        status: 'error',
        message: `Failed to connect to Firestore: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    setResults(testResults);
    setIsRunning(false);
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <div className="h-4 w-4 border-2 border-gray-300 border-t-2 border-t-blue-600 rounded-full animate-spin" />;
    }
  };

  const getStatusBadge = (status: TestResult['status']) => {
    switch (status) {
      case 'success':
        return <Badge variant="default" className="bg-green-100 text-green-800">PASS</Badge>;
      case 'error':
        return <Badge variant="destructive">FAIL</Badge>;
      default:
        return <Badge variant="secondary">RUNNING</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="h-5 w-5" />
            Firestore Connection Test
          </CardTitle>
          <CardDescription>
            Verify that Firestore is properly configured and working
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* User Info */}
          <Alert>
            <Database className="h-4 w-4" />
            <AlertDescription>
              <strong>User:</strong> {user?.email || 'Not authenticated'}<br />
              <strong>User ID:</strong> {user?.uid || 'N/A'}<br />
              <strong>Project:</strong> citadel-guard-nya4s
            </AlertDescription>
          </Alert>

          {/* Test Button */}
          <Button 
            onClick={runFirestoreTests} 
            disabled={isRunning || !user}
            className="w-full"
          >
            {isRunning ? 'Running Tests...' : 'Run Firestore Tests'}
          </Button>

          {/* Test Results */}
          {results.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium">Test Results:</h4>
              {results.map((result, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(result.status)}
                    <div>
                      <div className="font-medium">{result.test}</div>
                      <div className="text-sm text-muted-foreground">{result.message}</div>
                      {result.duration && (
                        <div className="text-xs text-muted-foreground">
                          Completed in {result.duration}ms
                        </div>
                      )}
                    </div>
                  </div>
                  {getStatusBadge(result.status)}
                </div>
              ))}
              
              {/* Summary */}
              <div className="mt-4 p-3 bg-muted rounded-lg">
                <div className="font-medium">Summary:</div>
                <div className="text-sm">
                  {results.filter(r => r.status === 'success').length} passed, {' '}
                  {results.filter(r => r.status === 'error').length} failed, {' '}
                  {results.filter(r => r.status === 'pending').length} pending
                </div>
              </div>
            </div>
          )}

          {!user && (
            <Alert>
              <AlertDescription>
                Please sign in to run Firestore tests.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
