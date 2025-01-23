// BlockchainMiddlewareUI.tsx
import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { CONFIG } from './config';
import { BLOCKCHAIN_MIDDLEWARE_ABI } from './contracts/BlockchainMiddleware';

// Type definitions
type WindowWithEthereum = Window & {
    ethereum?: {
        request: (args: {
            method: string;
            params?: any[];
        }) => Promise<any>;
        on: (event: string, callback: (accounts: string[]) => void) => void;
        removeListener: (event: string, callback: (accounts: string[]) => void) => void;
    };
};

interface TransactionStatus {
    hash?: string;
    status: 'pending' | 'success' | 'error';
    message: string;
}

interface BlockchainMiddleware extends ethers.BaseContract {
    updateWhitelist(address: string, status: boolean): Promise<ethers.ContractTransactionResponse>;
    whitelist(address: string): Promise<boolean>;
    owner(): Promise<string>;
    processRequest(data: Uint8Array, signature: string): Promise<ethers.ContractTransactionResponse>;
    getRequest(requestId: string): Promise<any>;
}

const BlockchainMiddlewareUI: React.FC = () => {
    // Core state management
    const [account, setAccount] = useState<string>('');
    const [contract, setContract] = useState<BlockchainMiddleware | null>(null);
    const [isWhitelisted, setIsWhitelisted] = useState<boolean>(false);
    const [requestData, setRequestData] = useState<string>('');
    const [status, setStatus] = useState<TransactionStatus | null>(null);
    const [error, setError] = useState<string>('');
    const [isOwner, setIsOwner] = useState<boolean>(false);
    const [addressToWhitelist, setAddressToWhitelist] = useState<string>('');


    // Initialize contract
    const initializeContract = async (provider: ethers.BrowserProvider) => {
        try {
            const signer = await provider.getSigner();
            const contract = new ethers.Contract(
                CONFIG.CONTRACT_ADDRESS,
                BLOCKCHAIN_MIDDLEWARE_ABI,
                provider
            ).connect(signer) as unknown as BlockchainMiddleware;
            setContract(contract);
        } catch (err) {
            console.error("Contract initialization error:", err);
            setError(`Contract initialization failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    };

    const checkOwnerStatus = async () => {
        try {
            if (!contract || !account) {
                console.log("Contract or account not initialized");
                return;
            }

            // Make sure we're connected to the correct network first
            const provider = new ethers.BrowserProvider(window.ethereum);
            const network = await provider.getNetwork();
            console.log("Current network:", network);

            // Get the signer
            const signer = await provider.getSigner();
            const signerAddress = await signer.getAddress();
            console.log("Signer address:", signerAddress);

            // Create a new contract instance with the signer
            const contractWithSigner = new ethers.Contract(
                CONFIG.CONTRACT_ADDRESS,
                BLOCKCHAIN_MIDDLEWARE_ABI,
                signer
            );

            // Call owner() with proper error handling
            try {
                const ownerAddress = await contractWithSigner.owner();
                console.log("Owner address:", ownerAddress);
                console.log("Current account:", account);
                setIsOwner(ownerAddress.toLowerCase() === account.toLowerCase());
            } catch (contractError) {
                console.error("Contract call error:", contractError);
                setIsOwner(false);
            }

        } catch (err) {
            console.error("Detailed error checking owner status:", err);
            setError(`Error checking owner status: ${err instanceof Error ? err.message : 'Unknown error'}`);
            setIsOwner(false);
        }
    };

    useEffect(() => {
        if (account && contract) {
            checkOwnerStatus();
        }
    }, [account, contract]);


    // Check if MetaMask is installed
    const checkMetaMaskInstalled = (): boolean => {
        const windowWithEthereum = window as WindowWithEthereum;
        return typeof windowWithEthereum.ethereum !== 'undefined';
    };

    // Add whitelisting function
    const handleWhitelist = async () => {
        try {
            if (!contract || !account) {
                setError('Contract or account not initialized');
                return;
            }
    
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            
            // Ensure address is properly formatted
            let formattedAddress = addressToWhitelist;
            if (!formattedAddress.startsWith('0x')) {
                formattedAddress = '0x' + formattedAddress;
            }
    
            // Validate address format
            if (!ethers.isAddress(formattedAddress)) {
                setError('Invalid Ethereum address format');
                return;
            }
    
            // Create a new contract instance with signer
            const contractWithSigner = contract.connect(signer) as BlockchainMiddleware;
    
            console.log("Attempting to whitelist:", {
                from: await signer.getAddress(),
                target: formattedAddress,
                contractAddress: CONFIG.CONTRACT_ADDRESS
            });
    
            // Send transaction without gas parameter, let MetaMask estimate
            const tx = await contractWithSigner.updateWhitelist(formattedAddress, true);
            
            setStatus({
                hash: tx.hash,
                status: 'pending',
                message: 'Processing whitelist update...'
            });
    
            await tx.wait();
            
            setStatus({
                hash: tx.hash,
                status: 'success',
                message: 'Address successfully whitelisted!'
            });
    
        } catch (err: any) {
            console.error('Detailed error:', err);
            setError(`Failed to whitelist address: ${err.message}`);
        }
    };

    async function setupNetwork() {
        if (!window.ethereum) return;
        
        const hardhatChainId = "0x7A69"; // 31337 in hex

        try {
            // First try to switch to the network
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: hardhatChainId }]
                });
            } catch (switchError: any) {
                // If the error code is 4902, the network isn't added yet
                if (switchError.code === 4902) {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: hardhatChainId,
                            chainName: 'LOCALAN',
                            nativeCurrency: {
                                name: 'ETH',
                                symbol: 'ETH',
                                decimals: 18
                            },
                            rpcUrls: ['http://127.0.0.1:8545']
                        }]
                    });
                } else {
                    throw switchError;
                }
            }

            // Wait a bit for the network switch to complete
            await new Promise(resolve => setTimeout(resolve, 1000));

            const provider = new ethers.BrowserProvider(window.ethereum);
            await provider.ready;

        } catch (error: any) {
            console.error('Error setting up network:', error);
            setError(`Network setup error: ${error.message}`);
            
            // If we get the duplicate RPC error, try to help the user
            if (error.code === -32603) {
                setError('Please remove the existing Hardhat network from MetaMask and try again');
            }
        }
    }

    useEffect(() => {
        const checkContract = async () => {
            if (window.ethereum) {
                const provider = new ethers.BrowserProvider(window.ethereum);
                try {
                    const code = await provider.getCode(CONFIG.CONTRACT_ADDRESS);
                    if (code === '0x') {
                        console.error('No contract deployed at this address');
                    } else {
                        console.log('Contract verified at address');
                        // Also check if we're the owner
                        const contract = new ethers.Contract(
                            CONFIG.CONTRACT_ADDRESS,
                            BLOCKCHAIN_MIDDLEWARE_ABI,
                            provider
                        );
                        const owner = await contract.owner();
                        const currentSigner = await provider.getSigner();
                        const currentAddress = await currentSigner.getAddress();
                        console.log('Contract owner:', owner);
                        console.log('Current address:', currentAddress);
                    }
                } catch (err) {
                    console.error('Contract verification failed:', err);
                }
            }
        };
        checkContract();
    }, []);
    
    // Add this function to periodically check network status
    useEffect(() => {
        const checkNetworkStatus = async () => {
            if (!window.ethereum) return;
            
            try {
                const provider = new ethers.BrowserProvider(window.ethereum);
                await provider.getBlockNumber(); // This will help sync the block number
            } catch (error) {
                console.error('Network status check error:', error);
            }
        };
    
        const interval = setInterval(checkNetworkStatus, 1000); // Check every second
    
        return () => clearInterval(interval);
    }, []);
    
    // Update the connectWallet function
    const connectWallet = async (): Promise<void> => {
        try {
            if (!checkMetaMaskInstalled()) {
                setError('Please install MetaMask!');
                return;
            }
    
            // Setup network first
            await setupNetwork();
    
            // Get accounts after network is setup
            const accounts = await window.ethereum!.request({
                method: 'eth_requestAccounts'
            });
            
            const connectedAccount = accounts[0];
            setAccount(connectedAccount);

            // Create provider after network and account setup
            const provider = new ethers.BrowserProvider(window.ethereum);
            await provider.ready;
            
            await initializeContract(provider);
    
            // Force a refresh of the account's state
            const balance = await provider.getBalance(connectedAccount);
            console.log('Account balance:', ethers.formatEther(balance));
    
            setError(''); // Clear any previous errors
    
            // After connection is established
            await checkWhitelistStatus();
    
        } catch (err) {
            console.error('Connection error:', err);
            setError(`Error connecting wallet: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    };

    // Add this function to check whitelist status
    const checkWhitelistStatus = async () => {
        try {
            if (!contract || !account) {
                console.log('Contract or account not initialized');
                return;
            }
    
            // Ensure we're using the checksum address
            const checksumAddress = ethers.getAddress(account);
            console.log('Checking whitelist status for:', checksumAddress);
    
            // Get provider and create contract instance
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contractWithSigner = contract.connect(signer);
    
            // Check whitelist status
            const status = await contractWithSigner.whitelist(checksumAddress);
            console.log('Whitelist status:', status);
            setIsWhitelisted(status);
    
        } catch (err) {
            console.error('Error checking whitelist status:', err);
            setIsWhitelisted(false);
        }
    };

    useEffect(() => {
        const verifyContract = async () => {
            try {
                const provider = new ethers.BrowserProvider(window.ethereum);
                const code = await provider.getCode(CONFIG.CONTRACT_ADDRESS);
                console.log("Contract code exists:", code !== "0x");
            } catch (err) {
                console.error("Contract verification failed:", err);
            }
        };
        verifyContract();
    }, []);

    useEffect(() => {
        if (account && contract) {
            checkWhitelistStatus();
        }
    }, [account, contract]);

    // Handle account changes
    useEffect(() => {
        const windowWithEthereum = window as WindowWithEthereum;

        const handleAccountChange = async (accounts: string[]): void => {
            try {
                if (accounts.length > 0) {
                    const currentAccount = accounts[0];
                    setAccount(currentAccount);
                    await checkWhitelistStatus();
                } else {
                    setAccount('');
                    setIsWhitelisted(false);
                }
            } catch (err) {
                console.error("Account change error:", err);
                setError(`Account change error: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
        };

        if (checkMetaMaskInstalled()) {
            windowWithEthereum.ethereum!.on('accountsChanged', handleAccountChange);
        }

        return () => {
            if (checkMetaMaskInstalled()) {
                windowWithEthereum.ethereum!.removeListener('accountsChanged', handleAccountChange);
            }
        };
    }, []);

    const submitRequest = async () => {
        try {
            if (!contract || !account || !requestData) {
                setError('Missing required data');
                return;
            }

            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contractWithSigner = contract.connect(signer);

            // Convert request data to bytes
            const dataBytes = ethers.toUtf8Bytes(requestData);
            
            // Sign the message
            const messageHash = ethers.id(requestData);
            const signature = await signer.signMessage(ethers.getBytes(messageHash));

            // Submit the request
            const tx = await contractWithSigner.processRequest(dataBytes, signature);
            
            setStatus({
                hash: tx.hash,
                status: 'pending',
                message: 'Processing request...'
            });

            await tx.wait();
            
            setStatus({
                hash: tx.hash,
                status: 'success',
                message: 'Request processed successfully!'
            });

            // Clear the input
            setRequestData('');

        } catch (err) {
            console.error('Error submitting request:', err);
            setStatus({
                status: 'error',
                message: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
            });
        }
    };

    const viewLatestRequest = async () => {
        try {
            if (!contract || !status.hash) {
                setError('No recent transaction or contract not initialized');
                return;
            }
    
            const provider = new ethers.BrowserProvider(window.ethereum);
            const receipt = await provider.getTransactionReceipt(status.hash);
            
            if (receipt && receipt.logs) {
                const iface = new ethers.Interface(BLOCKCHAIN_MIDDLEWARE_ABI);
                const log = receipt.logs.find(log => {
                    try {
                        const parsed = iface.parseLog(log);
                        return parsed?.name === 'RequestProcessed';
                    } catch (e) {
                        return false;
                    }
                });
    
                if (log) {
                    const parsedLog = iface.parseLog(log);
                    const requestId = parsedLog?.args[0];
                    const request = await contract.getRequest(requestId);
                    
                    setStatus({
                        ...status,
                        message: `
                            <div class="space-y-4">
                                <div class="font-semibold text-lg text-slate-800">Latest Request Details</div>
                                <div class="grid grid-cols-1 gap-3">
                                    <div class="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                                        <div class="text-sm text-slate-500">Request ID</div>
                                        <div class="font-mono text-sm break-all">${requestId}</div>
                                    </div>
                                    <div class="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                                        <div class="text-sm text-slate-500">Data</div>
                                        <div class="font-medium">${ethers.toUtf8String(request.data)}</div>
                                    </div>
                                    <div class="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                                        <div class="text-sm text-slate-500">Timestamp</div>
                                        <div>${new Date(Number(request.timestamp) * 1000).toLocaleString()}</div>
                                    </div>
                                </div>
                            </div>
                        `
                    });
                }
            }
        } catch (err) {
            console.error('Error viewing request:', err);
            setError('Failed to view request details');
        }
    };
    
    const getAllMyRequests = async () => {
        try {
            if (!contract || !account) {
                setError('Contract or account not initialized');
                return;
            }
    
            const provider = new ethers.BrowserProvider(window.ethereum);
            const filter = contract.filters.RequestProcessed(null, null, null);
            const events = await contract.queryFilter(filter);
            
            const requests = await Promise.all(events.map(async (event) => {
                const parsedLog = contract.interface.parseLog(event);
                const requestId = parsedLog?.args[0];
                const request = await contract.getRequest(requestId);
                
                return {
                    requestId: requestId,
                    data: ethers.toUtf8String(request.data),
                    timestamp: new Date(Number(request.timestamp) * 1000).toLocaleString(),
                    sender: request.sender
                };
            }));
    
            const myRequests = requests.filter(r => 
                r.sender.toLowerCase() === account.toLowerCase()
            );
    
            setStatus({
                ...status,
                message: `
                    <div class="space-y-4">
                        <div class="font-semibold text-lg text-slate-800">Your Requests</div>
                        <div class="grid grid-cols-1 gap-4">
                            ${myRequests.map(r => `
                                <div class="bg-white p-4 rounded-lg shadow-sm border border-slate-200 space-y-3">
                                    <div>
                                        <div class="text-sm text-slate-500">Request ID</div>
                                        <div class="font-mono text-sm break-all">${r.requestId}</div>
                                    </div>
                                    <div>
                                        <div class="text-sm text-slate-500">Data</div>
                                        <div class="font-medium">${r.data}</div>
                                    </div>
                                    <div>
                                        <div class="text-sm text-slate-500">Time</div>
                                        <div>${r.timestamp}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `
            });
    
        } catch (err) {
            console.error('Error getting requests:', err);
            setError('Failed to fetch requests');
        }
    };

    console.log("Render state - isOwner:", isOwner);
    console.log("Current account:", account);
    // UI Rendering
    return (
        // Main container with full viewport coverage and modern gradient background
        <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 to-slate-100
                    flex items-center justify-center p-6">

            {/* Content wrapper with max-width for larger screens */}
            <div className="w-full max-w-3xl mx-auto">
                {/* Main card with modern glass-morphism effect */}
                <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-8">
                    {/* Header with gradient text */}
                    <div className="mb-8 text-center">
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-800 to-slate-600
                                 bg-clip-text text-transparent">
                            Blockchain Middleware Interface
                        </h1>
                    </div>

                    {/* Main content area */}
                    {!account ? (
                        <div className="flex justify-center px-4">
                            <button
                                onClick={connectWallet}
                                className="w-full max-w-md bg-gradient-to-r from-blue-500 to-blue-600
                                     text-white px-8 py-4 rounded-xl font-medium
                                     hover:from-blue-600 hover:to-blue-700
                                     transition-all duration-200 transform hover:-translate-y-0.5
                                     shadow-md hover:shadow-lg"
                            >
                                Connect Wallet
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            {/* Status card */}
                            <div className="bg-slate-50 rounded-xl border border-slate-200 p-6">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-600">Connected:</span>
                                        <code className="bg-slate-100 px-4 py-1 rounded-lg font-mono text-slate-800">
                                            {account.slice(0,6)}...{account.slice(-4)}
                                        </code>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-600">Status:</span>
                                        <div className={`flex items-center ${
                                            isWhitelisted ? 'text-emerald-600' : 'text-red-600'
                                        }`}>
                                        <span className={`h-2 w-2 rounded-full mr-2 ${
                                            isWhitelisted ? 'bg-emerald-500' : 'bg-red-500'
                                        }`} />
                                            {isWhitelisted ? 'Whitelisted' : 'Not Whitelisted'}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Request Data section */}
                            <div className="space-y-3">
                                <label className="block text-sm font-medium text-slate-700">
                                    Request Data
                                </label>
                                <input
                                    type="text"
                                    value={requestData}
                                    onChange={(e) => setRequestData(e.target.value)}
                                    className="w-full p-4 border border-slate-200 rounded-xl
                                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                                         transition-all duration-200 outline-none"
                                    placeholder="Enter request data"
                                />
                            </div>

                            {/* Submit button */}
                            <button
                                onClick={submitRequest}
                                disabled={!isWhitelisted}
                                className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600
                                     text-white px-8 py-4 rounded-xl font-medium
                                     hover:from-emerald-600 hover:to-emerald-700
                                     disabled:from-slate-400 disabled:to-slate-500
                                     transition-all duration-200 transform hover:-translate-y-0.5
                                     disabled:hover:transform-none
                                     shadow-md hover:shadow-lg disabled:shadow-none"
                            >
                                Submit Request
                            </button>

                            {/* Transaction status with HTML support */}
                            {status && (
                                <div className={`mt-4 rounded-xl p-6 ${
                                    status.status === 'pending' ? 'bg-amber-50 border border-amber-200' :
                                    status.status === 'success' ? 'bg-emerald-50 border border-emerald-200' :
                                    'bg-red-50 border border-red-200'
                                }`}>
                                    <div dangerouslySetInnerHTML={{ __html: status.message }} />
                                </div>
                            )}

                            <div className="flex gap-4 mt-4">
                                <button
                                    onClick={viewLatestRequest}
                                    className="flex-1 bg-blue-500 text-white px-4 py-2 rounded-xl font-medium
                                        hover:bg-blue-600 transition-all duration-200 transform hover:-translate-y-0.5
                                        disabled:bg-slate-400 disabled:hover:transform-none"
                                    disabled={!status?.hash}
                                >
                                    View Latest Request
                                </button>
                                <button
                                    onClick={getAllMyRequests}
                                    className="flex-1 bg-green-500 text-white px-4 py-2 rounded-xl font-medium
                                        hover:bg-green-600 transition-all duration-200 transform hover:-translate-y-0.5"
                                >
                                    View All My Requests
                                </button>
                            </div>
                        </div>
                    )}

                    {isOwner && (
                        <div className="mt-8 pt-8 border-t border-slate-200">
                            <div className="space-y-6">
                                <h2 className="text-2xl font-semibold text-slate-800">
                                    Admin Controls
                                </h2>

                                <div className="bg-slate-50 rounded-xl p-6 space-y-4">
                                    <h3 className="text-lg font-medium text-slate-700">
                                        Whitelist Management
                                    </h3>

                                    <div className="flex flex-col gap-4">
                                        <h2 className="text-2xl font-bold">Whitelist Management</h2>
                                        
                                        <div className="flex flex-col gap-2">
                                            <input
                                                type="text"
                                                value={addressToWhitelist}
                                                onChange={(e) => setAddressToWhitelist(e.target.value)}
                                                placeholder="Enter Ethereum address (0x...)"
                                                className="flex-1 p-4 border border-slate-200 rounded-xl"
                                            />
                                            <p className="text-sm text-gray-500">
                                                Enter a valid Ethereum address (40 characters, with or without 0x prefix)
                                            </p>
                                        </div>
                                        
                                        <button
                                            onClick={handleWhitelist}
                                            disabled={!isOwner || !addressToWhitelist}
                                            className="px-6 py-2 bg-blue-500 text-white rounded-xl disabled:opacity-50"
                                        >
                                            Whitelist Address
                                        </button>
                                        
                                        {error && (
                                            <div className="p-4 bg-red-100 text-red-700 rounded-xl">
                                                {error}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BlockchainMiddlewareUI;