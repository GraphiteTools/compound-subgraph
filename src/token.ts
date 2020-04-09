import { BigInt, Bytes, Address } from "@graphprotocol/graph-ts";

import { cToken as cTokenContract, Transfer, Borrow, RepayBorrow, LiquidateBorrow } from "../generated/cDAI Token/cToken";
import { erc20 as erc20Contract } from "../generated/cDAI Token/erc20";
import { Token, cToken, Balance, Loan, User } from "../generated/schema";

export function handleTransfer(event: Transfer): void {
	let address = event.address;
	let from = event.params.from;
	let to = event.params.to;
	let amount = event.params.amount;

	let ctokenContract = cTokenContract.bind(address);

	let ctoken = cToken.load(address.toHexString());
	if (!ctoken) {
		ctoken = new cToken(address.toHexString());
		ctoken.address = address;
		ctoken.name = ctokenContract.name();
		ctoken.symbol = ctokenContract.symbol();

		let underlyingAddressCallResult = ctokenContract.try_underlying();
		let underlyingAddress = underlyingAddressCallResult.reverted
			? Address.fromString('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2')
			: underlyingAddressCallResult.value;
		let tokenContract = erc20Contract.bind(underlyingAddress);
		let token = new Token(underlyingAddress.toHexString());

		ctoken.underlying = underlyingAddress.toHexString();
		token.address = underlyingAddress;
		token.save();
	}

	ctoken.supplyIndex = ctokenContract.exchangeRateStored();
	ctoken.borrowIndex = ctokenContract.borrowIndex();
	ctoken.borrowRate = ctokenContract.borrowRatePerBlock();
	ctoken.supplyRate = ctokenContract.supplyRatePerBlock();

	// Update balances
	if (from.toHexString() != address.toHexString()) {
		let fromUserId = from.toHexString();
		let fromUser = User.load(fromUserId);
		if (!fromUser) {
			fromUser = new User(fromUserId);
			fromUser.save();
		}
		let fromBalanceId = from.toHexString() + '-' + address.toHexString();
		let fromBalance = Balance.load(fromBalanceId);
		if (!fromBalance) {
			fromBalance = new Balance(fromBalanceId);
			fromBalance.user = fromUserId;
			fromBalance.balance = new BigInt(0);
			fromBalance.token = ctoken.id;
		}
		fromBalance.balance -= amount;
		fromBalance.save();
	}
	if (to.toHexString() != address.toHexString()) {
		let toUserId = to.toHexString();
		let toUser = User.load(toUserId);
		if (!toUser) {
			toUser = new User(toUserId);
			toUser.save();
		}
		let toBalanceId = to.toHexString() + '-' + address.toHexString();
		let toBalance = Balance.load(toBalanceId);
		if (!toBalance) {
			toBalance = new Balance(toBalanceId);
			toBalance.user = toUserId;
			toBalance.balance = new BigInt(0);
			toBalance.token = ctoken.id;
		}
		toBalance.balance += amount;
		toBalance.save();
	}

	ctoken.save();
}

export function handleBorrow(event: Borrow): void {
	let address = event.address;
	let account = event.params.borrower;

	let loanId = account.toHexString() + '-' + address.toHexString();
	let loan = Loan.load(loanId);

	if (!loan) {
		let user = User.load(account.toHexString());
		if (!user) {
			user = new User(account.toHexString());
			user.save();
		}

		loan = new Loan(loanId);
		loan.user = account.toHexString();
		loan.token = address.toHexString();
	}

	let ctokenContract = cTokenContract.bind(address);
	loan.amount = ctokenContract.borrowBalanceStored(account);
	loan.index = ctokenContract.borrowIndex();
	loan.save();
}

export function handleRepayBorrow(event: RepayBorrow): void {
	let address = event.address;
	let account = event.params.borrower;

	let loanId = account.toHexString() + '-' + address.toHexString();
	let loan = Loan.load(loanId);

	if (!loan) {
		let user = User.load(account.toHexString());
		if (!user) {
			user = new User(account.toHexString());
			user.save();
		}

		loan = new Loan(loanId);
		loan.user = account.toHexString();
		loan.token = address.toHexString();
	}

	let ctokenContract = cTokenContract.bind(address);
	loan.amount = ctokenContract.borrowBalanceStored(account);
	loan.index = ctokenContract.borrowIndex();
	loan.save();
}

export function handleLiquidateBorrow(event: LiquidateBorrow): void {
	let address = event.address;
	let collateralAddress = event.params.cTokenCollateral;
	let borrowerAccount = event.params.borrower;
	let liquidatorAccount = event.params.liquidator;
	let collateralAmount = event.params.seizeTokens;

	// Repay borrower's debt
	let loanId = borrowerAccount.toHexString() + '-' + address.toHexString();
	let loan = Loan.load(loanId);

	let ctokenContract = cTokenContract.bind(address);
	loan.amount = ctokenContract.borrowBalanceStored(borrowerAccount);
	loan.index = ctokenContract.borrowIndex();
	loan.save();

	// Seize borrower's collateral balance
	let borrowerBalanceId = borrowerAccount.toHexString() + '-' + collateralAddress.toHexString();
	let borrowerBalance = Balance.load(borrowerBalanceId);
	borrowerBalance.balance -= collateralAmount;
	borrowerBalance.save();

	// Increase liquidator's collateral balance
	let liquidatorBalanceId = liquidatorAccount.toHexString() + '-' + collateralAddress.toHexString();
	let liquidatorBalance = Balance.load(liquidatorBalanceId);
	if (!liquidatorBalance) {
		liquidatorBalance = new Balance(liquidatorBalanceId);
		liquidatorBalance.balance = new BigInt(0);
		liquidatorBalance.token = collateralAddress.toHexString();
	}
	liquidatorBalance.balance -= collateralAmount;
	liquidatorBalance.save();
}
